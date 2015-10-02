'use strict';
const assert = require('assert'),
  koa = require('koa'),
  supertest = require('supertest'),
  inject = require('./inject');

let app;

beforeEach(function() {
  app = koa();
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
      return 1
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
    }
  }));
  app.use(inject(function* (next, foo, baz) {
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

it('throws on self dependency', function() {
  assert.throws(function() {
    inject({
      e: function(e) {}
    });
  });
});

it('throws on a provider expecting next', function() {
  assert.throws(function() {
    inject({
      next: true,
      nope: function(next) {}
    });
  });
});
