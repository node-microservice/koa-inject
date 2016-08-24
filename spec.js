'use strict';
const assert = require('assert'),
  koa = require('koa'),
  supertest = require('supertest-as-promised'),
  inject = require('./inject');

let app;

beforeEach(function() {
  app = koa();
});

it('passes through', function() {

  app.use(inject(function* (next) {
    let status = yield new Promise(resolve => {
      setTimeout(function() {
        resolve(201);
      }, 300);
    });
    this.status = status;
  }));

  return supertest(app.callback())
    .get('/')
    .expect(201);
});

it('works', function() {
  let fooValue,
    barValue,
    bazValue;

  app.use(function* (next) {
    this.blah = 'blah';
    yield* next;
  });
  app.use(inject.initialize());
  app.use(inject({
    foo: function() {
      return Promise.resolve(1);
    },
    bar: function*(foo) {
      const bar = yield new Promise(function(resolve) {
        setTimeout(function() {
          resolve('bar' + foo);
        }, 300);
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

  return supertest(app.callback())
    .get('/')
    .expect(200)
    .then(function() {
      assert.equal(fooValue, 1);
      assert.equal(barValue, 'bar1');
      assert.equal(bazValue, 'bar1baz');
    });
});

// this is important to make things like constructor objects (Mongoose models, as an example) available for inejction.
it('does not call a function that is returned', function() {
  app.use(inject.initialize());
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

  return supertest(app.callback())
    .get('/')
    .expect(204);
});

it('lets you use .get inside a timeout', function() {
  function getQwerty() {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(inject.get('qwerty'));
      }, 300);
    });
  }

  app.use(inject.initialize());
  app.use(inject({
    qwerty: function () {
      return 'qwerty';
    }
  }));
  app.use(function*(next) {
    const qwerty = yield getQwerty();
    assert.equal(qwerty, 'qwerty');
    this.status = 202;
  });

  return supertest(app.callback())
    .get('/')
    .expect(202);
});

it('errors when middleware does not set this[key]', function() {
  app.use(inject({
    asdf: function* (next) {
      yield new Promise(function(resolve) {
        setTimeout(resolve, 300);
      })
      yield* next;
    }
  }));

  return supertest(app.callback())
    .get('/')
    .expect(500);
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
