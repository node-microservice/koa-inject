'use strict';

const assert = require('assert'),
  compose =  require('koa-compose'),
  getParameterNames = require('get-parameter-names'),
  cls = require('continuation-local-storage'),
  isGeneratorFn = require('is-generator').fn,
  sort = require('toposort');

const registry = process.__provided_injection = (process.__provided_injection || {});
const ns = cls.getNamespace('inject') || cls.createNamespace('inject');

function check(dependency) {
  if (dependency === 'next' || dependency in registry) {
    return;
  }
  throw new Error(`${dependency} is not registered`);
}

function set(key, value) {
  ns.get('state')[key] = value;
}

function get(key) {
  return ns.get('state')[key];
}

function inject(fn, parameters, provides) {
    const generator = isGeneratorFn(fn);

    return function* (next) {
      const dependencies = parameters.map(parameter => {
        return parameter === 'next' ? next : get(parameter);
      });

      const result = fn.apply(this, dependencies);

      if (generator) {
        yield result;

        if (provides) {
          const value = this.state[provides] || this[provides];

          if (typeof value === 'undefined') {
            throw new Error(`Generator did not set ${provides}`);
          }

          set(provides, value);
        }
      } else {
        const value = yield Promise.resolve(result);

        if (provides) {
          if (typeof value === 'undefined') {
            throw new Error(`Function did not return a value for ${provides}`)
          }

          set(provides, value);
        }
      }
    };
}

function* initialize(next) {
  if (typeof this.state.inject === 'undefined') {
    this.state.inject = ns.createContext();

    ns.enter(this.state.inject);
    ns.set('state', this.state);
    try {
      yield* next;
    } finally {
      ns.exit(this.state.inject);
    }
  } else {
    yield* next;
  }
}

function consumer(fn) {
  const parameters = getParameterNames(fn);

  parameters.forEach(check);

  return compose([
    initialize,
    inject(fn, parameters)
  ]);
}

function producer(arg) {
  const nodes = [], edges = [], values = {};

  Object.keys(arg).forEach(key => {
    if (key in registry) {
      throw new Error(`${key} is already registered`);
    }

    const fn = arg[key];

    assert(typeof fn === 'function', `${key} must be a function`);

    const parameters = getParameterNames(fn);

    parameters.forEach(parameter => {
      if (parameter === 'next') {
        return;
      }

      if (parameter in arg) {
        edges.push([parameter, key]);
      } else {
        check(parameter);
      }
    });

    nodes.push(key);
    values[key] = inject(fn, parameters, key)
    registry[key] = true;
  });

  const providers = compose(sort.array(nodes, edges).map(key => {
    return function* (next) {
      yield values[key].call(this, next);
      yield* next;
    }
  }));

  return compose([
    initialize,
    function* (next) {
      yield providers;
      yield* next;
    }
  ]);
}

module.exports = function (arg) {
  assert(arg && typeof arg === 'object' || typeof arg === 'function',
    'inject() requires either a producer object or a consumer function');

  return typeof arg === 'function' ? consumer(arg) : producer(arg);
};

module.exports.set = set;
module.exports.get = get;
