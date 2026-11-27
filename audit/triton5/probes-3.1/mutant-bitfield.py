# Kehai: undo the 6.3.1.1p2 fix in a scratch copy, then run t5c-01 and t5c-02 (T5C_DIFF_COUNT=300) against it.
p='tcc5/types.js'; s=open(p).read()
old="    if (ty.bitWidth < 32) return TY_INT;"
assert old in s; s=s.replace(old,"    if (ty.bitWidth < 32 && false) return TY_INT; /* KEHAI MUTANT */"); open(p,'w').write(s)
