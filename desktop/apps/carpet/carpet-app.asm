; CARPET -- a TritOS Desktop 2 app. Ed Interim, 2026-11-24. MIT.
; Draws op(x, y) for every pixel, with x and y counted from the centre in
; balanced ternary, for six two-input operations. SPACE cycles the op, Q quits.
; The binary version of this (x XOR y) is the old "munching squares";
; the ternary ops give nested 3x3 Latin squares instead of Sierpinski triangles.
; Position-independent: R8 = UBASE on entry, data addressed as R8 + offset.
.mode T3
.equ MODE, 5900          ; current op index (0..5), at UBASE + 5900
.equ BUF, 6000           ; 162 x 108 pixel buffer, UBASE + 6000 .. + 23495
.org 0
entry:
        LI   R0, #190
        LI   R1, #96
        LI   R2, #190
        LI   R3, #150
        LI   R4, #title - entry
        ADD  R4, R4, R8
        LI   R5, #-364
        SYSCALL #10              ; SYS_WIN_OPEN
        LI   R0, #0
        STX  R0, R8, #MODE
redraw:
        CALLX render
loop:
        SYSCALL #25              ; SYS_GET_EVENT
        CMPI R0, #1
        JNZX idle
        CMPI R1, #32             ; space: next op
        JZX  next
        CMPI R1, #81             ; Q
        JZX  quit
        CMPI R1, #113            ; q
        JZX  quit
        CMPI R1, #27             ; Esc
        JZX  quit
idle:
        SYSCALL #2               ; SYS_YIELD
        JMPX loop
next:
        LDX  R0, R8, #MODE
        ADDI R0, R0, #1
        CMPI R0, #6
        JNZX store
        LI   R0, #0
store:  STX  R0, R8, #MODE
        JMPX redraw
quit:
        SYSCALL #0               ; SYS_EXIT

render:
        LDX  R7, R8, #MODE
        LI   R6, #BUF
        ADD  R6, R6, R8
        LI   R3, #-54            ; y: -54 .. +53
ry:     LI   R4, #-81            ; x: -81 .. +80
rx:     CMPI R7, #0
        JNZX m1
        TXOR R5, R4, R3
        JMPX px
m1:     CMPI R7, #1
        JNZX m2
        TCON R5, R4, R3
        JMPX px
m2:     CMPI R7, #2
        JNZX m3
        TANY R5, R4, R3
        JMPX px
m3:     CMPI R7, #3
        JNZX m4
        TMIN R5, R4, R3
        JMPX px
m4:     CMPI R7, #4
        JNZX m5
        TMAX R5, R4, R3
        JMPX px
m5:     ADD  R5, R4, R3
px:     MULI R5, R5, #3          ; 5-trit result -> lift into all three colour diads
        STX  R5, R6, #0
        ADDI R6, R6, #1
        ADDI R4, R4, #1
        CMPI R4, #81
        JNZX rx
        ADDI R3, R3, #1
        CMPI R3, #54
        JNZX ry
        LI   R0, #10
        LI   R1, #4
        LI   R2, #162
        LI   R3, #108
        LI   R4, #BUF
        ADD  R4, R4, R8
        LI   R5, #0              ; direction: buffer -> window
        SYSCALL #27              ; SYS_WIN_BLIT_BUF
        LI   R0, #0
        LI   R1, #114
        LI   R2, #190
        LI   R3, #30
        LI   R4, #-364
        SYSCALL #20              ; clear the label strip
        LDX  R7, R8, #MODE
        LI   R2, #lab0 - entry
        CMPI R7, #1
        JNZX l2
        LI   R2, #lab1 - entry
l2:     CMPI R7, #2
        JNZX l3
        LI   R2, #lab2 - entry
l3:     CMPI R7, #3
        JNZX l4
        LI   R2, #lab3 - entry
l4:     CMPI R7, #4
        JNZX l5
        LI   R2, #lab4 - entry
l5:     CMPI R7, #5
        JNZX lgo
        LI   R2, #lab5 - entry
lgo:    ADD  R2, R2, R8
        LI   R0, #10
        LI   R1, #116
        LI   R3, #364
        LI   R4, #-364
        SYSCALL #21              ; SYS_WIN_DRAW_TEXT
        LI   R0, #10
        LI   R1, #128
        LI   R2, #hint - entry
        ADD  R2, R2, R8
        LI   R3, #121
        LI   R4, #-364
        SYSCALL #21
        LI   R0, #0
        LI   R1, #0
        LI   R2, #0
        LI   R3, #0
        SYSCALL #24              ; SYS_WIN_FLUSH, whole window
        RET

title:  .stringz "CARPET"
lab0:   .stringz "TXOR: SUM MOD 3"
lab1:   .stringz "TCON: CONSENSUS"
lab2:   .stringz "TANY: ACCEPT ANY"
lab3:   .stringz "TMIN: TERNARY AND"
lab4:   .stringz "TMAX: TERNARY OR"
lab5:   .stringz "ADD: WITH CARRIES"
hint:   .stringz "SPACE:NEXT  Q:QUIT"
