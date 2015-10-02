'use strict';

function one() {
  return 1;
}

function* two() {
  yield '2';
}

function* co(fn) {
  yield* fn();
}

function* test() {
  var start = {
    value: 0
  };

  yield co(one);
  yield* co(two);
}

for (let v of test()) {
  console.log(v, typeof v);
}
