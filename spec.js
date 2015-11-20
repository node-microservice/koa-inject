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
      return Promise.resolve(1);
    },
    bar: function*(foo) {
      const bar = yield new Promise(function(resolve) {
        setTimeout(function() {
          resolve('bar' + foo);
        }, 200);
      });

      this.bar = bar;
    },
    baz: function* (bar) {
      assert.equal(this.blah, 'blah');
      const baz = yield Promise.resolve(bar + 'baz');
      this.baz = baz;
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

it('does not call a function that is returned', function(done) {
  app.use(inject({
    func: function() {
      return function() {
        throw new Error('dont call');
      };
    }
  }));

  app.use(inject(function* (func) {
    assert.equal(typeof func, 'function');
    this.status = 204;
  }));

  supertest(app.callback())
    .get('/')
    .expect(204)
    .end(done);
});

it('errors when middleware does not set this[key]', function(done) {
  app.use(inject({
    asdf: function* (next) {
      yield new Promise(function(resolve) {
        setTimeout(resolve, 500);
      })
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
