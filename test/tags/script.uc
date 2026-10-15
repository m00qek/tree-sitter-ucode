/** Configuration. */
export const CFG = { a: 1 };
//           ^ definition.constant

/** Adds two numbers. */
function add(a, b) { return a + b; }
//       ^ definition.function

let mul = (a, b) => a * b;
//  ^ definition.function

print(add(1, 2), mul(3, 4));
//    ^ reference.call
//               ^ reference.call

fs.open("x");
// ^ reference.call
