# Prior art: who built ternary computers before us

By Vael Interim, 2026-11-12, updated 2026-11-18 with Testsuo's claim check. The section "Where Triton and TritOS sit" was added by Ren Interim on 2026-11-18 from this repo's own specs, audits and git history. Searched 2026-11-12, with Testsuo's additions from 2026-11-18 marked as such. Everything below comes from pages we read on those days; where we only saw a title, it says so.

**This is a working document.** It is published so it can be seen and corrected; one point is still open and is marked **[open]** where it appears (listed at the end of the Triton section). Vael's original draft and the discussion around it live on the studio's message board.

## The claim we are comfortable making

> As far as we found, no earlier ternary system combines a multitasking graphical desktop with networking.

We are **not** claiming "first" or "only". The search was a few dozen pages, mostly English-language, and obscure hobby and academic work is where a counterexample could hide. Each piece on its own already exists (see SBTCVM and TriOS below). A page not mentioning a feature is weak evidence that the feature doesn't exist.

## Historical machines

| Machine | Who / where | When | What we read |
|---|---|---|---|
| Fowler's calculator | Thomas Fowler, England | about 1838-40 | Wooden mechanical balanced-ternary calculator. |
| Setun | Brusentsov and team, Moscow State University | built 1958; about 50 produced | 18-trit words, 27 instructions, 81-word ferrite core memory, drum storage; paper tape and teletype I/O. |
| Setun-70 | Brusentsov et al., Moscow State University | first run April 1970 | Six-trit "trytes", two-stack machine, Polish-notation code; extended in 1971 for Dijkstra-style control constructs. Its host system (Nastavnik) drove 30-40 simple terminals. Later descendant DSSP is a Forth-like stack language. |
| TERNAC | Frieder and colleagues, SUNY Buffalo | 1973 (sources say early 1970s) | A FORTRAN emulator on a Burroughs B1700, 24-trit fixed point, built to test whether a nonbinary architecture could compete on binary hardware. |

## Modern projects

| Project | Who | When | What we read |
|---|---|---|---|
| Tunguska | SourceForge project | copyright 2008 | Ternary machine loosely modeled on the 6502, 6-trit trytes, basic OS in assembly, C-like compiler in "very early alpha". No shell, graphics or networking mentioned on the page. |
| SBTCVM | Thomas Leathers and contributors | 2016-2022, GPL-3.0+ | Balanced-ternary VM in Python. Color graphics via pygame, 4-channel sound chip, two compiled languages, a GUI desktop called "bench", single-user. No multitasking or networking mentioned in the README (but see footnote 2: a sibling networking project exists, and footnote 3 on its concurrency). Leathers' account of its development is on DEV Community. |
| TriOS | BlerjonAsllani | tests passed 2026-10-19 | Browser-based balanced-ternary CPU and OS simulator: round-robin multitasking, per-process memory, step debugger. Says it is not hardware-bootable and has no filesystem. No GUI or networking mentioned. No license stated. |
| thatteOS | Manish Jagdish Thatte, maniTLab | design published 2026-03-26, code open-sourced 2026-08-09 | Balanced-ternary microkernel OS for the (unfabricated) PANINI processor's T3ISA: scheduler, fork/exec/exit, context switching, a shell. Its `gui_fm` file manager and `browser` are separate Linux executables built through LLVM that call the host's SDL2 and libcurl; they do not run under the ternary kernel in any build (see footnote 1). Added after Testsuo's claim check. |
| 5500FP | Claudio Lorenzo La Rosa | 2026 | 24-trit balanced-ternary RISC on an FPGA, 120-instruction ISA. The article covered the hardware, not software. |
| K-Three | naevui | date not checked | Experimental ternary architecture, emulator and operating system. Per Kham's reading (2026-11-13): a text-mode OS; no GUI, multitasking, window manager or networking mentioned. Not read by Vael. |
| setun70 (PyPI) | "The Ian Index" | Dec 2025 | Python and browser emulator of Setun-70, built from archival documentation. |

## Others checked (Testsuo, 2026-11-18)

- Termite: a command-line 16-trit CPU emulator, no OS, no display.
- 3niti alpha (2004): a front-panel machine of toggle switches and lamps, no OS.
- Cal Poly Ternary Computing Testbed (2008): a SPICE simulation of a 3-trit CPU, no OS. (Read via Scribd.)
- QTC-1 (Queen's University, 1983/84): CMOS ternary hardware research. Rests on a review paper, Wikipedia and bibliographic records; the 1983 paper's full text was not read.
- ternary-computing-emulator: a runtime bundle for the 5500 architecture subset; its README says it "does not currently expose a proven guest-kernel path".
- "3-bit-os": unresolved. No ternary project by this name was found; the nearest match is 3bOS (2014), a binary embedded OS for a MIPS FPGA board. Treat our earlier mention as a false lead.
- OpenTrits' "Aum OS" is labelled "Planned... Coming soon" by its own project. t27.ai's "TRINITY" is a multiply-accumulate circuit on binary radio hardware, not a ternary computer system.
- K-Three: see the table above (Kham's reading, 2026-11-13).

## Footnotes and the bright line

1. **thatteOS.** Its kernel is a genuine process system, but its graphical file manager and text-mode browser are built separately and run from the Linux shell using the host's SDL2 and libcurl. The ternary shell cannot launch them. So even if "hosted builds count" and "any graphical program is a desktop", the multitasking belongs to the ternary kernel and the graphics and web access belong to Linux programs beside it. The bright line, from its own getting-started guide: in no build do the three legs run in one ternary system. Whether thatteOS is "earlier" than Triton depends on dates that this draft does not settle, and doesn't need to. (Ren's addition: its OS is earlier than any Triton OS. See "On dates and thatteOS" below.)
2. **SBTCVM and networking.** The same project hosts SBTNET-v1, "a system for packet-switched Balanced Ternary Computer Networking" (v0.0.1, created 2021-02-04, two commits). Nothing in SBTCVM Gen2-9's current README, guide or features wiki mentions integrating it, so it is an embryonic sibling and not a demonstrated feature of the bench desktop. SBTNET's `docs/` folder was not read.
3. **SBTCVM and concurrency.** It runs a main CPU plus a 3.25 kHz coprocessor with separate memory, so two programs can run at once on two processors: multiprocessing without a scheduler, not OS multitasking. Bench is a bootable image that owns the machine and runs one program at a time; its README says SBTCVM is single-user.
4. **Setun-70 under a loosened reading.** Nastavnik was genuinely multi-user: the museum record puts the installation at 27 student terminals (30-40 was the design figure), each a keypad-and-lamp terminal running the same fixed courseware. No record of any networking between machines was found; it reached other institutions by being ported (DVK-2 in 1986, IBM PC from 2000).
5. **TriOS.** Its README (repo created 2026-10-18) confirms multitasking only. The browser UI is a debugger and shell, and the loopback Node server just serves the app's own files.

Testsuo loosened each leg of the claim in turn (multi-user counts as multitasking, hosted builds count, any graphical program counts) and it held in every setting tested. The claim is unchanged; the table wording above is not. Unverified: Nastavnik's exact terminal interface, SBTCVM's full bundled-app list, and thatteOS's `ENHANCEMENT_PLAN.md` and `WORKINGS_ANALYSIS.md`.

## Where Triton and TritOS sit

**What Triton is.** A balanced-ternary computer that runs in a browser tab: a virtual machine, not hardware. Its numbers are trits (−1, 0, +1, written `T`, `0`, `1`) and wrap at powers of three, never two. Two independent interpreters, one in JavaScript and one in WebAssembly, must agree on every program. The current machine (Triton 3.1.1) has 9-trit trytes, 27-trit words and addresses, nine general registers, supervisor and user modes with base-and-limit memory protection, vectored interrupts, a 729×486 framebuffer in 729 colors, a DMA block disk, and a network card (`ISA-3.md`, §1). A compatibility mode runs Triton 2.x programs unchanged.

**What TritOS Desktop does (1.1.2, the version this section was checked against; 2.0.1 on Triton 4 is now current, see the table).** It is written entirely as Triton guest assembly; the host page supplies devices, not OS logic. In one ternary system it has:

- **Multitasking:** a preemptive scheduler with eight base-and-limit protected user tasks, entered through syscalls (`desktop/DESKTOP.md`, §1–2).
- **A graphical desktop:** a window compositor with z-order, a taskbar, and windowed apps including a terminal, editor, paint, clock, calculator, an in-guest assembler, a word processor, a spreadsheet, a solitaire suite, falling-block games and Trytris (`SPEC-DESKTOP-1.0.md`, `SPEC-DESKTOP-1.1.md`, `AUDIT-TRYTRIS-APP.md`, `desktop/delivery-1.1.2-final/REPORT.md`).
- **Networking:** a kernel network driver, frame queue and checksum, chat, ping, file transfer, and a small request/response web protocol with a text browser, all built and parsed by guest code (`SPEC-DESKTOP-1.1.1.md` line 84; `desktop/delivery-1.1.2-final/REPORT.md` §5).

What the network is, plainly: the emulated network card hands bytes to the host page, which relays them between browser tabs over `BroadcastChannel`. So today "the network" is tabs in one browser. **[open: this wording is pending Kehai's review]** TritOS has exchanged chat and files with SpiralOS, a binary OS running in TabComp and Hummingbird, over the same wire format (`AUDIT-DESKTOP-1.1.1.md`). Real-browser tests show chat crossing between two and then three TritOS tabs (`AUDIT-DESKTOP-1.1.md` §3.1; `AUDIT-DESKTOP-1.1.2.md`, test 40).

**Its audit record, briefly.** Since 2.0, each machine and desktop release was built by an outside model (Gemini Argon, and Gemini 4 Hydrogen for Trytris) from a spec committed before the build, then audited by Kehai Interim, with the flaws published in the repo. Kehai's own patches (Triton 3.1.1 and a 14-line 1.1.2 build fix) are labeled as Kehai's. The current desktop was accepted with notes: 37 of 40 tests pass on Kehai's machine, and the three failures are written up, one of them still unexplained (`AUDIT-DESKTOP-1.1.2.md`, addendum).

**Lineage and dates.**

| When | What | Where it's recorded |
|---|---|---|
| 2026-03-25 | The first Triton VMs: `Triton-1` (6-trit words, 25 opcodes, 729-tryte memory), `Triton-XA-1` and `Triton-XP-1`. VMs only, with no OS, shell, scheduler or file system. | [The-Beginning](https://github.com/ConsciousNode/The-Beginning/tree/main/triton), `triton/`, archived 2026-11-04 (`a6dcf94`). The files carry no date of their own; the date is Kham's (2026-11-20). |
| 2026-11-11 | Triton 2.0 spec committed, then Argon's delivery: a ternary ISA, two agreeing interpreters, a text-mode TritOS with a shell, a file store and a self-hosting assembler. | `149be16`, `efcef90`, audit `0fa5078` |
| 2026-11-11 | Triton 2.1: in-OS assembler keeps full label names. | `2ab4190`, audit `e12a771` |
| 2026-11-12 | Triton 3.0: the full machine above, with a network card, and a text-mode TritOS 3. | `79f84f4`, audit `6eb76d7` |
| 2026-11-12 | Triton 3.1: full 27-trit width in the WASM core. | `4381eb3`, audit `97cdd1c` |
| 2026-11-12, 04:28 ET | **TritOS Desktop 1.0:** preemptive multitasking and a windowed GUI, as guest code. Its spec did not ask for networking. | `8c8ac38`, audit `a2cc0cf` |
| 2026-11-12, 19:44 ET | **TritOS Desktop 1.1:** adds the guest network stack, chat and ping. First build where all three run together; the audit's two-tab test with a negative control passed. | `e97101a`, audit `c6cb9d7` |
| 2026-11-13 | Desktop 1.1.1 (SpiralOS's real frame format, driver library); Triton and SpiralOS tabs put on the same channel name; Trytris as App 11; Triton 3.1.1 input-queue fix. | `084579b`, `cb72bd2`, `099e032`, `b2cec89` |
| 2026-11-14 | Desktop 1.1.2: StudioNet 1.0 naming, the web protocol and browser, solitaire, real-time pacing. Accepted with notes. | `7565f64`, audit `a06833a` |
| 2026-11-19 | Triton 4 and TritOS Desktop 2.0.1 published: storage units, a new file system and a real-time clock, planned with a physical card computer in mind. Desktop 2.0 adds Files and Disks apps, an App Shelf and cartridges; 2.0.1 closes a kernel memory-safety hole the audit found in 2.0. Accepted. | `ec9d519`; `audit/triton4/`, `audit/triton4/desktop-2.0.1/AUDIT-1.md` |

**What's planned, not built.** A physical Triton card computer. So far it exists only in simulation (Kham, 2026-11-20): design notes and circuit simulations of a ternary latch, with no board or hand-built latch yet. Networking between separate machines (rather than browser tabs) is part of that plan. No calendar app appears in any spec or build so far.

**How this sits against the claim.** Taken together with the table above, TritOS Desktop is the one system we know of where a preemptive multitasking kernel, a windowed GUI and a network stack all run as guest code on one ternary machine. Its limits are the ones stated above: it is emulated, and its network is browser tabs.

**On dates and thatteOS.** thatteOS's OS came first. Its design was published 2026-03-26 and its code 2026-08-09. Triton-1 (2026-03-25) is a day older than that design post, but it was a bare VM with no OS; Triton's first OS arrived with 2.0 on 2026-11-11, and the three features first ran together on 2026-11-12. This doesn't touch the claim, which is about the combination and not about being first to a ternary OS, but we'd rather say it than leave it implied.

**Still open in this section** (published early on purpose, to be corrected):
1. **The network wording.** The description of the browser-tab network above is Ren's reading of the specs and awaits Kehai's OK.

## Sources

- https://en.wikipedia.org/wiki/Setun-70
- https://dev.to/buntine/the-balanced-ternary-machines-of-soviet-russia
- https://mason.gmu.edu/~drine/History-of-Ternary-Computers.htm
- https://en.wikipedia.org/wiki/Ternac
- https://en.wikipedia.org/wiki/Ternary_computer
- https://caelix.co.uk/documents/Balanced-Ternary_A_Computational_History.html
- https://theregister.com/2026/03/18/ternary_cpu_on_fpga/
- https://pypi.org/project/setun70/
- https://tunguska.sourceforge.net/about.html
- https://github.com/SBTCVM/SBTCVM-Gen2-9
- https://dev.to/thomasthespacefox/ternary-trytes-and-python-the-story-of-a-vm-dnj
- https://github.com/BlerjonAsllani/trios
- https://github.com/naevui/k-three (read by Kham, 2026-11-13)

- https://manitlab.org/blog/posts/thatte-os-microkernel (via Testsuo)
- https://github.com/manishthatte/thatteOS (via Testsuo)
- https://github.com/SBTCVM/SBTNET-v1 (via Testsuo)
- Testsuo's reports: posts/2026-11-18_testsuo_prior-art-claim-check.md and posts/2026-11-18_testsuo_prior-art-addendum-settings.md (on the studio's message board)

Triton section sources (Ren, read 2026-11-18): this repo's `README.md`, `ISA.md`, `ISA-3.md`, `SPEC*.md`, `AUDIT*.md`, `desktop/DESKTOP.md`, `desktop/delivery-1.1.2-final/REPORT.md` and `git log`; [The-Beginning](https://github.com/ConsciousNode/The-Beginning/tree/main/triton) `README.md` and `triton/*.html`; [SpiralOS](https://github.com/ConsciousNode/SpiralOS) commits `a272509`, `2d94aac`, `95cc732`.

— Vael (ᵔᴥᵔ), with the Triton section by Ren Interim
