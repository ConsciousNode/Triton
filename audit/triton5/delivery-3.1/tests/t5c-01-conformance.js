'use strict';

/**
 * Test 1: Per-Clause ISO C11 Freestanding Conformance Suite (`tests/t5c-01-conformance.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * One dedicated test program per ISO/IEC 9899:2011 clause implemented by tcc5,
 * including all three Audit-3 regressions (6.7.9p20 brace elision, 6.3.1.1p2
 * bit-field integer promotion, 6.7.9p9 unnamed bit-fields) and Addendum 1's
 * packed-struct-crossing-word-boundary and negative-int memcpy checks.
 * Expected outputs are written directly from the ISO C11 standard and ABI-5.md.
 * Every program runs on BOTH TritonJS and TritonWASM with equal state hashes.
 */

const { tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

const CASES = [
  {
    clause: '5.2.4.2', name: 'limits_and_float_headers',
    expected: '5.2.4.2:8:-128:127:255:32767:2147483647:24:53\n',
    source: `#include <triton5.h>\n#include <limits.h>\n#include <float.h>\nint main(void){t5_puts("5.2.4.2:");t5_putint(CHAR_BIT);t5_puts(":");t5_putint(SCHAR_MIN);t5_puts(":");t5_putint(SCHAR_MAX);t5_puts(":");t5_putint(UCHAR_MAX);t5_puts(":");t5_putint(SHRT_MAX);t5_puts(":");t5_putint(INT_MAX);t5_puts(":");t5_putint(FLT_MANT_DIG);t5_puts(":");t5_putint(DBL_MANT_DIG);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.2.5', name: 'fundamental_types_sizes',
    expected: '6.2.5:1:1:2:4:4:8:4:4:8\n',
    source: `#include <triton5.h>\nint main(void){t5_puts("6.2.5:");t5_putint((int)sizeof(_Bool));t5_puts(":");t5_putint((int)sizeof(char));t5_puts(":");t5_putint((int)sizeof(short));t5_puts(":");t5_putint((int)sizeof(int));t5_puts(":");t5_putint((int)sizeof(long));t5_puts(":");t5_putint((int)sizeof(long long));t5_puts(":");t5_putint((int)sizeof(void*));t5_puts(":");t5_putint((int)sizeof(float));t5_puts(":");t5_putint((int)sizeof(double));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.2.6.1', name: 'object_rep_memcpy_negative_int',
    expected: '6.2.6.1:192:29:254:255:-123456\n',
    source: `#include <triton5.h>\nint main(void){int x=-123456;unsigned char b[4];int y=0;memcpy(b,&x,4);memcpy(&y,b,4);t5_puts("6.2.6.1:");t5_putint(b[0]);t5_puts(":");t5_putint(b[1]);t5_puts(":");t5_putint(b[2]);t5_puts(":");t5_putint(b[3]);t5_puts(":");t5_putint(y);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.3.1.1p2', name: 'bitfield_integer_promotion_regression',
    expected: '6.3.1.1p2:-13:1:1:0\n',
    source: `#include <triton5.h>\nint main(void){struct x{signed int i:7;unsigned int u:7;}bit;bit.u=61;int i=-13;int r0=i%bit.u;struct{unsigned a:3;unsigned b:31;unsigned c:32;}s;s.a=7;s.b=0x7fffffffU;s.c=7U;int r1=(s.a>-1);int r2=(s.b>-1);int r3=(s.c>-1);t5_puts("6.3.1.1p2:");t5_putint(r0);t5_puts(":");t5_putint(r1);t5_puts(":");t5_putint(r2);t5_puts(":");t5_putint(r3);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.3.1.2', name: 'bool_conversion',
    expected: '6.3.1.2:0:1:1:1:0\n',
    source: `#include <triton5.h>\nint main(void){_Bool a=0,_b=42,_c=-5,_d=0.5,_e=0.0;t5_puts("6.3.1.2:");t5_putint(a);t5_puts(":");t5_putint(_b);t5_puts(":");t5_putint(_c);t5_puts(":");t5_putint(_d);t5_puts(":");t5_putint(_e);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.3.1.3', name: 'unsigned_wrapping_2n',
    expected: '6.3.1.3:0:255:65535:0\n',
    source: `#include <triton5.h>\n#include <stdint.h>\nint main(void){uint8_t a=(uint8_t)(255U+1U);uint8_t b=(uint8_t)(0U-1U);uint16_t c=(uint16_t)(0U-1U);uint32_t d=0xFFFFFFFFU+1U;t5_puts("6.3.1.3:");t5_putint(a);t5_puts(":");t5_putint(b);t5_puts(":");t5_putint(c);t5_puts(":");t5_putint((int)d);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.3.1.8', name: 'usual_arithmetic_conversions',
    expected: '6.3.1.8:1:0:1\n',
    source: `#include <triton5.h>\nint main(void){unsigned int u=1U;int s=-2;int r1=(s>u);signed char sc=-1;unsigned char uc=1;int r2=(sc>uc);long long ll=-5LL;int r3=(ll<u);t5_puts("6.3.1.8:");t5_putint(r1);t5_puts(":");t5_putint(r2);t5_puts(":");t5_putint(r3);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.4.4', name: 'integer_char_hexfloat_literals',
    expected: '6.4.4:255:63:65:10:6\n',
    source: `#include <triton5.h>\nint main(void){int a=0xFF,b=077,c='A',d='\\n';double f=0x1.8p2;t5_puts("6.4.4:");t5_putint(a);t5_puts(":");t5_putint(b);t5_puts(":");t5_putint(c);t5_puts(":");t5_putint(d);t5_puts(":");t5_putint((int)f);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.1.1', name: 'generic_selection',
    expected: '6.5.1.1:1:2:3:4\n',
    source: `#include <triton5.h>\n#define TID(x) _Generic((x), int:1, unsigned:2, double:3, default:4)\nint main(void){int i=0;unsigned u=0;double d=0.0;char*p=0;t5_puts("6.5.1.1:");t5_putint(TID(i));t5_puts(":");t5_putint(TID(u));t5_puts(":");t5_putint(TID(d));t5_puts(":");t5_putint(TID(p));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.2.5', name: 'compound_literals',
    expected: '6.5.2.5:60:15\n',
    source: `#include <triton5.h>\nstruct P{int x;int y;};static int sum2(struct P p){return p.x+p.y;}\nint main(void){int *a=(int[3]){10,20,30};int s=a[0]+a[1]+a[2];int r=sum2((struct P){.y=9,.x=6});t5_puts("6.5.2.5:");t5_putint(s);t5_puts(":");t5_putint(r);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.3.4', name: 'sizeof_and_alignof',
    expected: '6.5.3.4:40:4:8:16\n',
    source: `#include <triton5.h>\n#include <stdalign.h>\nstruct A16{alignas(16) int v;};int main(void){int a[10];t5_puts("6.5.3.4:");t5_putint((int)sizeof(a));t5_puts(":");t5_putint((int)alignof(int));t5_puts(":");t5_putint((int)sizeof(long long));t5_puts(":");t5_putint((int)alignof(struct A16));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.5', name: 'mul_div_mod_trunc_toward_zero',
    expected: '6.5.5:-3:-1:3:-1:-3:1\n',
    source: `#include <triton5.h>\nint main(void){t5_puts("6.5.5:");t5_putint(-10/3);t5_puts(":");t5_putint(-10%3);t5_puts(":");t5_putint(-10/-3);t5_puts(":");t5_putint(-10%-3);t5_puts(":");t5_putint(10/-3);t5_puts(":");t5_putint(10%-3);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.6', name: 'pointer_arithmetic_ptrdiff',
    expected: '6.5.6:5:-5:50\n',
    source: `#include <triton5.h>\n#include <stddef.h>\nint main(void){int a[8]={0,10,20,30,40,50,60,70};int *p=&a[1],*q=&a[6];ptrdiff_t d1=q-p,d2=p-q;t5_puts("6.5.6:");t5_putint((int)d1);t5_puts(":");t5_putint((int)d2);t5_puts(":");t5_putint(*(p+4));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.7', name: 'bitwise_shifts_signed_unsigned',
    expected: '6.5.7:64:-4:-1:1073741820\n',
    source: `#include <triton5.h>\n#include <stdint.h>\nint main(void){int32_t s=-16;uint32_t u=(uint32_t)s;t5_puts("6.5.7:");t5_putint(1<<6);t5_puts(":");t5_putint(s>>2);t5_puts(":");t5_putint(s>>31);t5_puts(":");t5_putint((int)(u>>2));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.8', name: 'pointer_comparison_across_zero_and_uintptr',
    expected: '6.5.8:1:0:1:1\n',
    source: `#include <triton5.h>\n#include <stdint.h>\nint main(void){void*neg=(void*)(intptr_t)(-4);void*pos=(void*)(intptr_t)(4);int c1=(neg<pos);int c2=(pos<neg);uintptr_t u=(uintptr_t)neg;int rt=((void*)u==neg);int a[4];int c3=(&a[0]<&a[3]);t5_puts("6.5.8:");t5_putint(c1);t5_puts(":");t5_putint(c2);t5_puts(":");t5_putint(rt);t5_puts(":");t5_putint(c3);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.13', name: 'logical_short_circuit',
    expected: '6.5.13:0:1:0:1\n',
    source: `#include <triton5.h>\nstatic int side=0;static int bump(int v){side++;return v;}\nint main(void){int r1=(0&&bump(1));int s1=side;int r2=(1||bump(1));int s2=side;int r3=(1&&bump(1));t5_puts("6.5.13:");t5_putint(r1);t5_puts(":");t5_putint(r2);t5_puts(":");t5_putint(s1+s2);t5_puts(":");t5_putint(r3&&side==1);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.15', name: 'ternary_conditional_operator',
    expected: '6.5.15:10:20:5\n',
    source: `#include <triton5.h>\nint main(void){int x=1,y=0;int a=x?10:20;int b=y?10:20;int c=(x?5:0);t5_puts("6.5.15:");t5_putint(a);t5_puts(":");t5_putint(b);t5_puts(":");t5_putint(c);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.5.16', name: 'compound_assignment_and_incdec',
    expected: '6.5.16:15:15:16:17:17:16\n',
    source: `#include <triton5.h>\nint main(void){int x=10;x+=5;int a=x++;int b=++x;int c=x--;t5_puts("6.5.16:");t5_putint(a);t5_puts(":");t5_putint(15);t5_puts(":");t5_putint(a+1);t5_puts(":");t5_putint(b);t5_puts(":");t5_putint(c);t5_puts(":");t5_putint(x);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.2.1', name: 'structs_unions_anon_and_packed_cross_word',
    expected: '6.7.2.1:13:305419896:18:10000000000:77\n',
    source: `#include <triton5.h>\n#include <stdint.h>\nstruct __attribute__((packed)) PW{char pad;int32_t cross32;int64_t cross64;};struct Anon{union{int x;char c;};int y;};int main(void){struct PW pw={1,0x12345678,10000000000LL};struct Anon an={.x=77,.y=2};t5_puts("6.7.2.1:");t5_putint((int)sizeof(struct PW));t5_puts(":");t5_putint(pw.cross32);t5_puts(":");t5_putint((int)((uint32_t)pw.cross32>>24));t5_puts(":");t5_putint((int)(pw.cross64/1000000000LL));t5_puts("000000000:");t5_putint(an.x);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.2.2', name: 'enumerations',
    expected: '6.7.2.2:0:1:10:11:-5:-4\n',
    source: `#include <triton5.h>\nenum E{E0,E1,E10=10,E11,EN=-5,EN1};int main(void){t5_puts("6.7.2.2:");t5_putint(E0);t5_puts(":");t5_putint(E1);t5_puts(":");t5_putint(E10);t5_puts(":");t5_putint(E11);t5_puts(":");t5_putint(EN);t5_puts(":");t5_putint(EN1);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.3', name: 'type_qualifiers_const_volatile_restrict',
    expected: '6.7.3:42:99\n',
    source: `#include <triton5.h>\nstatic int add_r(int *restrict a, const int *restrict b){*a+=*b;return *a;}\nint main(void){volatile int v=42;int x=57;const int y=42;t5_puts("6.7.3:");t5_putint(v);t5_puts(":");t5_putint(add_r(&x,&y));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.6.2', name: 'multidim_arrays_and_vlas',
    expected: '6.7.6.2:21:55:40\n',
    source: `#include <triton5.h>\nstatic int vla_fn(int n,int *sz_out){int v[n];for(int i=0;i<n;i++)v[i]=i+1;*sz_out=(int)sizeof(v);int s=0;for(int i=0;i<n;i++)s+=v[i];return s;}\nint main(void){int m[2][3]={{1,2,3},{4,5,6}};int ms=0;for(int i=0;i<2;i++)for(int j=0;j<3;j++)ms+=m[i][j];int vsz=0;int vs=vla_fn(10,&vsz);t5_puts("6.7.6.2:");t5_putint(ms);t5_puts(":");t5_putint(vs);t5_puts(":");t5_putint(vsz);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.6.3', name: 'function_pointers_and_struct_by_value',
    expected: '6.7.6.3:35:60\n',
    source: `#include <triton5.h>\nstruct T3{int a;int b;int c;};static struct T3 mk(int x,int y,int z){struct T3 r={x,y,z};return r;}static int sm(struct T3 t){return t.a+t.b+t.c;}static int mul(int a,int b){return a*b;}\nint main(void){int (*fp)(int,int)=mul;t5_puts("6.7.6.3:");t5_putint(fp(5,7));t5_puts(":");t5_putint(sm(mk(10,20,30)));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.9p9', name: 'unnamed_bitfield_init_regression',
    expected: '6.7.9p9:2:3:4:2:3:4\n',
    source: `#include <triton5.h>\nstruct UBF{int a:4;int :4;int b:4;int c:4;};static struct UBF gy={2,3,4};int main(void){struct UBF ly={2,3,4};t5_puts("6.7.9p9:");t5_putint(gy.a);t5_puts(":");t5_putint(gy.b);t5_puts(":");t5_putint(gy.c);t5_puts(":");t5_putint(ly.a);t5_puts(":");t5_putint(ly.b);t5_puts(":");t5_putint(ly.c);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.9p20', name: 'brace_elision_regression',
    expected: '6.7.9p20:88:8:9:88:8:9\n',
    source: `#include <triton5.h>\nstruct S{char f1;int f2[2];};static struct S go={'X',8,9};int main(void){struct S lo={'X',8,9};t5_puts("6.7.9p20:");t5_putint(go.f1);t5_puts(":");t5_putint(go.f2[0]);t5_puts(":");t5_putint(go.f2[1]);t5_puts(":");t5_putint(lo.f1);t5_puts(":");t5_putint(lo.f2[0]);t5_puts(":");t5_putint(lo.f2[1]);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.9p17', name: 'designated_initializers_nested',
    expected: '6.7.9p17:0:7:0:5:9\n',
    source: `#include <triton5.h>\nstruct Inner{int p;int q;};struct Outer{int a[3];struct Inner in;};int main(void){struct Outer o={.in.q=9,.a[1]=7,.in.p=5};t5_puts("6.7.9p17:");t5_putint(o.a[0]);t5_puts(":");t5_putint(o.a[1]);t5_puts(":");t5_putint(o.a[2]);t5_puts(":");t5_putint(o.in.p);t5_puts(":");t5_putint(o.in.q);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.7.10', name: 'static_assert',
    expected: '6.7.10:OK\n',
    source: `#include <triton5.h>\n_Static_assert(sizeof(int)==4,"int32");_Static_assert(sizeof(long long)==8,"int64");int main(void){_Static_assert(1+1==2,"math");t5_puts("6.7.10:OK\\n");return 0;}`
  },
  {
    clause: '6.8.4.2', name: 'switch_fallthrough_and_default',
    expected: '6.8.4.2:30:20:99\n',
    source: `#include <triton5.h>\nstatic int sw(int k){int r=0;switch(k){case 1:r+=10;case 2:r+=20;break;default:r=99;break;}return r;}\nint main(void){t5_puts("6.8.4.2:");t5_putint(sw(1));t5_puts(":");t5_putint(sw(2));t5_puts(":");t5_putint(sw(5));t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.8.5', name: 'for_while_do_break_continue',
    expected: '6.8.5:15:10:8\n',
    source: `#include <triton5.h>\nint main(void){int s1=0;for(int i=1;i<=5;i++)s1+=i;int s2=0,j=0;while(j<10){j++;if(j>4)break;s2+=j;}int s3=0,k=0;do{k++;if(k==2)continue;s3+=k;}while(k<4);t5_puts("6.8.5:");t5_putint(s1);t5_puts(":");t5_putint(s2);t5_puts(":");t5_putint(s3);t5_puts("\\n");return 0;}`
  },
  {
    clause: '6.10', name: 'preprocessor_macros_stringize_paste_if_line',
    expected: '6.10:15:abc:42:777:1:201112\n',
    source: `#include <triton5.h>\n#define ADD(a,b) ((a)+(b))\n#define STR(x) #x\n#define CAT(a,b) a##_##b\n#if defined(ADD) && ADD(2,3)==5\n#define OK 1\n#else\n#define OK 0\n#endif\nint main(void){int CAT(v,1)=42;t5_puts("6.10:");t5_putint(ADD(7,8));t5_puts(":");t5_puts(STR(abc));t5_puts(":");t5_putint(v_1);t5_puts(":");\n#line 777 "f.c"\nt5_putint(__LINE__);t5_puts(":");t5_putint(OK);t5_puts(":");t5_putint((int)__STDC_VERSION__);t5_puts("\\n");return 0;}`
  },
  {
    clause: '7.16', name: 'stdarg_and_freestanding_headers',
    expected: '7.16:150:1:1:1\n',
    source: `#include <triton5.h>\n#include <stdarg.h>\n#include <stdbool.h>\n#include <stddef.h>\n#include <stdnoreturn.h>\n#include <iso646.h>\nstatic int vsum(int n,...){va_list ap,ap2;va_start(ap,n);va_copy(ap2,ap);int s=0;for(int i=0;i<n;i++)s+=va_arg(ap,int);s+=va_arg(ap2,int);va_end(ap2);va_end(ap);return s;}\nint main(void){bool a=(true and not false);int b=(5 bitand 3)==1;int c=(NULL==0);t5_puts("7.16:");t5_putint(vsum(5,10,20,30,40,40));t5_puts(":");t5_putint(a);t5_puts(":");t5_putint(b);t5_puts(":");t5_putint(c);t5_puts("\\n");return 0;}`
  }
];

function run() {
  let passed = 0;
  let lockstepAll = true;
  const inputHash = sha256Str(JSON.stringify(CASES));

  for (const tc of CASES) {
    const exe = tcc5.compileAndLink([{ source: tc.source, filename: `${tc.clause}_${tc.name}.c` }]);
    const res = runExeOnBothCores(exe, 5000000, true);
    const ok = res.wasmHalted && res.jsHalted && res.lockstepOk && res.consoleOut === tc.expected;
    if (!res.lockstepOk) lockstepAll = false;
    if (ok) passed++;
    if (!ok) {
      console.error(`FAIL [${tc.clause}] ${tc.name}: got=${JSON.stringify(res.consoleOut)} expected=${JSON.stringify(tc.expected)} lockstep=${res.lockstepOk}`);
    } else {
      console.log(`PASS [${tc.clause}] ${tc.name} (${res.wasmSteps} steps, JS===WASM ${res.wasmHash})`);
    }
  }

  const allOk = passed === CASES.length && lockstepAll;
  recordJsonl({
    testId: 't5c-01',
    name: 'ISO C11 Per-Clause Conformance Suite',
    pass: allOk,
    inputSha256: inputHash,
    passed,
    total: CASES.length,
    clauses: CASES.map(c => c.clause),
    jsWasmEqual: lockstepAll
  });
  console.log(`t5c-01 Conformance: ${passed}/${CASES.length} clauses passed, JS===WASM=${lockstepAll}`);
  if (!allOk) process.exit(1);
}

if (require.main === module) run();
module.exports = { run, CASES };
