'use strict';
const co = require('co'),
  compose =  require('koa-compose'),
  getParameterNames = require('get-parameter-names'),
  sort = require('toposort');

const registry = {};

function check(dependency) {
  if (dependency === 'next' || dependency in registry) {
    return;
  }
  throw new Error(`${dependency} is not registered`);
}

function inject(fn, dependencies) {
  let wrapped = co.wrap(fn);
  return function(next, provides) {
    return function* () {
      const ctx = this;
      const args = dependencies.map(dependency => {
        return dependency === 'next' ? next : ctx[dependency];
      });
      yield wrapped.apply(ctx, args).then(function(value) {
        if (provides) {
          const provided = (ctx[provides] = ctx[provides] || value);

          if (provided) {
            return;
          }

          throw new Error(`Dependency not provided! (did your middleware set this.${provides}?)`);
        }
      });
    }
  };
}

module.exports = function(arg) {
  if (typeof arg === 'function') {
    const parameters = getParameterNames(arg);

    parameters.forEach(check);

    const injected = inject(arg, parameters);

    return function* (next) {
      yield injected(next);
    };
  } else if (arg && typeof arg === 'object') {
    const nodes = [],
      edges = [];

    Object.keys(arg).forEach(key => {
      if (key in registry) {
        throw new Error(`${key} is already registered`);
      }

      const fn = arg[key];

      if (typeof fn === 'function') {
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
        registry[key] = inject(fn, parameters);
      } else {
        throw new Error(`${key} must be a provider function`);
      }
    });

    const providers = compose(sort.array(nodes, edges).map(key => {
      const provider = registry[key];
      return function* (next) {
        yield provider(next, key);
        yield* next;
      }
    }));

    return function* (next) {
      yield providers;
      yield* next;
    };
  } else {
    throw new Error('inject() requires either a provider definition object or a dependency function');
  }
};
