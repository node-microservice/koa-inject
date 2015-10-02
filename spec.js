'use strict';
const assert = require('assert'),
  koa = require('koa'),
  supertest = require('supertest'),
  inject = require('./inject');

let app;

beforeEach(function() {
  app = koa();
});

it('passes through', function(done) {
  app.use(inject(function* (next) {
    let status = yield new Promise(resolve => {
      setTimeout(function() {
        resolve(201);
      }, 500);
    });
    this.status = status;
    yield* next;
  }));
  supertest(app.callback())
    .get('/')
    .expect(201)
    .end(done);
});

it('works', function(done) {
  let fooValue,
    barValue,
    bazValue;

  app.use(function* (next) {
    this.blah = 'blah';
    yield* next;
  });
  app.use(inject({
    foo: function() {
      return 1;
    },
    bar: function(foo) {
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve('bar' + foo);
        }, 200);
      })
    },
    baz: function(bar) {
      assert.equal(this.blah, 'blah');
      return bar + 'baz';
    },
    blip: function* (next) {
      this.blip = 'blip'
      yield* next;
    }
  }));
  app.use(inject(function* (next, foo, baz, blip) {
    fooValue = foo;
    bazValue = baz;
    yield* next;
  }));
  app.use(inject(function* (bar) {
    barValue = bar;
    this.status = 200;
  }));

  supertest(app.callback())
    .get('/')
    .expect(200)
    .end(function() {
      assert.equal(fooValue, 1);
      assert.equal(barValue, 'bar1');
      assert.equal(bazValue, 'bar1baz');
      done();
    });
});

it('errors when middleware does not set this[key]', function(done) {
  app.use(inject({
    asdf: function* (next) {
      this.fail = 'fail';
      yield* next;
    }
  }));

  supertest(app.callback())
    .get('/')
    .expect(500)
    .end(done);
});

it('throws on unsatisfied dependency in provider', function() {
  assert.throws(function() {
    inject({
      fail: function(a) {}
    });
  });
});

it('throws on unsatisfied dependency in function', function() {
  assert.throws(function() {
    inject(function(b) {});
  });
});

it('throws on cyclic dependency', function() {
  assert.throws(function() {
    inject({
      c: function(d) {},
      d: function(c) {}
    });
  });
});

it('throws on non-function provider', function() {
  assert.throws(function() {
    inject({
      f: 1
    });
  });
});

it('throws on self dependency', function() {
  assert.throws(function() {
    inject({
      e: function(e) {}
    });
  });
});
