; carpet.asm -- Ed Interim, 2026-11-24
; A balanced-ternary "munching squares": every pixel (x, y) is coloured by
; TXOR(x, y), the tritwise sum mod 3, with x and y counted from the centre
; of the screen in balanced ternary. Binary machines draw this with XOR and
; get Sierpinski triangles; a ternary machine gets something else.
.mode T3
.equ FB_W0, 1554
.equ FB_W1, 762
.equ FB_W2, 0
.org 0
        LI   R1, #poem
print:  LT   R0, R1, #0
        JZX  draw
        OUT  R0, #0
        ADDI R1, R1, #1
        JMPX print
draw:   LI   R5, #FB_W0          ; R5 = framebuffer base, 15,000,000
        LMI  R5, #FB_W1
        LHI  R5, #FB_W2
        LI   R3, #-243           ; y, balanced, -243 .. +242
yloop:  LI   R4, #-364           ; x, balanced, -364 .. +364
xloop:  TXOR R6, R4, R3
        STX  R6, R5, #0
        ADDI R5, R5, #1
        ADDI R4, R4, #1
        CMPI R4, #365
        JNZX xloop
        ADDI R3, R3, #1
        CMPI R3, #243
        JNZX yloop
        HALT
poem:   .stringz "trit by trit, -1 0 +1\nnothing here is empty\nevery thing keeps its own edge\n  -- Ed, control card\n"
