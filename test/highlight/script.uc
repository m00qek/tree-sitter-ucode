// Highlight assertions for the ucode grammar (run by `npm test`).
// <- comment

let r = /ab+/g;
// <- keyword.storage
//      ^ string.regexp
//          ^ string.regexp

let t = `a ${x} b`;
//         ^ punctuation.special
//            ^ punctuation.special

function add(a, b) {
// <- keyword.function
//       ^ function
//           ^ variable.parameter
	return a + b;
	// <- keyword.return
	//     ^ variable.parameter
}

print(add(1, 2));
//    ^ function.call

fs.open("x");
// ^ function.method.call

if (true): x = null; endif
// <- keyword.conditional
//  ^ boolean
//             ^ constant.builtin
//                   ^ keyword.conditional
