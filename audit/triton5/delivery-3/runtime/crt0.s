; Triton 5.0 Freestanding C Startup (`runtime/crt0.s`)
; ConsciousNode SoftWorks — MIT License
; Initializes C stack pointer R8 (__stack_top), zeroes .bss, runs .init_array
; constructors, invokes main(), and halts.

  .globl _start
  .text
_start:
  ; Relocate hardware SP to 4,000,000 via SPR_ESP(10)/SPR_EPC(9)/IRET so large binaries never collide with default SP=200,000
  LC R0, 4000000
  MTSPR R0, 10
  LMA R0, .sp_ready
  MTSPR R0, 9
  LI R0, 0
  MTSPR R0, 11
  IRET
.sp_ready:
  ; Initialize C data stack pointer R8 = __stack_top (C-space)
  LA R8, __stack_top
  MOV R7, R8

  ; Zero .bss using BFILL (machine space = C space - 1093)
  LMA R0, __bss_start
  LMA R2, __bss_end
  SUB R2, R2, R0
  CMPI R2, 0
  JNPX .bss_done
  LI R1, 0
  BFILL R0, R1, R2
.bss_done:

  ; Run .init_array constructors (each entry is a 4-byte little-endian C-space fn ptr)
  LA R4, __init_array_start
  LA R5, __init_array_end
.init_loop:
  CMP R4, R5
  JNNX .init_done
  ; Load 4-byte C-space function pointer at [R4 - 1093 .. R4 - 1090]
  LT R3, R4, -1090
  MULI R3, R3, 256
  LT R0, R4, -1091
  ADD R3, R3, R0
  MULI R3, R3, 256
  LT R0, R4, -1092
  ADD R3, R3, R0
  MULI R3, R3, 256
  LT R0, R4, -1093
  ADD R3, R3, R0
  WRAPS R3, R3, 32
  SUBI R3, R3, 1093
  ; Indirect call to constructor (preserve R4, R5)
  PUSH R4
  PUSH R5
  CALLX 2
  JMPX 2
  JR R3
  POP R5
  POP R4
  ADDI R4, R4, 4
  JMPX .init_loop
.init_done:

  ; Call main(0, NULL)
  LI R0, 0
  LI R1, 0
  CALL_SYM main
  ; Exit value remains in R0
  HALT
