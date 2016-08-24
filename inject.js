'use strict';

const assert = require('assert'),
  compose =  require('koa-compose'),
  getParameterNames = require('get-parameter-names'),
  cls = require('continuation-local-storage'),
  isGeneratorFn = require('is-generator').fn,
  sort = require('toposort');

function inject(fn, parameters, provides) {
    const generator = isGeneratorFn(fn);

    return function* (next) {
      const ns = cls.getNamespace('inject');
      const dependencies = parameters.map(parameter => {
        return parameter === 'next' ? next : ns.get(parameter);
      });

      const result = fn.apply(this, dependencies);

      if (generator) {
        yield result;

        if (provides) {
          const value = this.state[provides] || this[provides];

          if (typeof value === 'undefined') {
            throw new Error(`Generator did not set ${provides}`);
          }

          ns.set(provides, value);
        }
      } else {
        const value = yield Promise.resolve(result);

        if (provides) {
          if (typeof value === 'undefined') {
            throw new Error(`Function did not return a value for ${provides}`)
          }

          ns.set(provides, value);
        }
      }
    };
}

function consumer(fn) {
  const parameters = getParameterNames(fn);

  return inject(fn, parameters);
}

function producer(arg) {
  const nodes = [], edges = [], values = {};

  Object.keys(arg).forEach(key => {
    const fn = arg[key];

    assert(typeof fn === 'function', `${key} must be a function`);

    const parameters = getParameterNames(fn);

    parameters.forEach(parameter => {
      if (parameter === 'next') {
        return;
      }

      if (parameter in arg) {
        edges.push([parameter, key]);
      }
    });

    nodes.push(key);
    values[key] = inject(fn, parameters, key)
  });

  const providers = compose(sort.array(nodes, edges).map(key => {
    return function* (next) {
      yield values[key].call(this, next);
      yield next;
    }
  }));

  return function* (next) {
    yield providers;
    yield next;
  };
}

module.exports = function (arg) {
  assert(arg && typeof arg === 'object' || typeof arg === 'function',
    'inject() requires either a producer object or a consumer function');

  return typeof arg === 'function' ? consumer(arg) : producer(arg);
};

module.exports.initialize = function() {
  const ns = cls.createNamespace('inject');

  return function*(next) {
    const ctx = ns.createContext();

    ns.enter(ctx);

    try {
      yield next;
    } finally {
      ns.exit(ctx);
    }
  };
};

module.exports.get = function(key) {
  const ns = cls.getNamespace('inject');

  return ns.get(key);
};
