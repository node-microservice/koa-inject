'use strict';
const compose =  require('koa-compose'),
  getParameterNames = require('get-parameter-names'),
  isGeneratorFn = require('is-generator').fn,
  sort = require('toposort');

const registry = {};

function check(dependency) {
  if (dependency === 'next' || dependency in registry) {
    return;
  }
  throw new Error(`${dependency} is not registered`);
}

function inject(fn, parameters, provides) {
    const generator = isGeneratorFn(fn);

    return function*(next) {
      const ctx = this;
      const dependencies = parameters.map(parameter => {
        return parameter === 'next' ? next : ctx[parameter];
      });
      const result = fn.apply(ctx, dependencies);

      if (generator) {
        yield result;
      } else {
        yield Promise.resolve(result).then(function(value) {
          if (provides) {
            ctx[provides] = value;
          }
        });
      }

      if (provides && ctx[provides] === undefined) {
        throw new Error(`value not provided, did your provider set this.${provides}?`);
      }
    };
}

module.exports = function(arg) {
  if (typeof arg === 'function') {
    const parameters = getParameterNames(arg);

    parameters.forEach(check);

    return inject(arg, parameters);
  } else if (arg && typeof arg === 'object') {
    const nodes = [], edges = [];

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
        registry[key] = inject(fn, parameters, key);
      } else {
        throw new Error(`${key} must be a provider function`);
      }
    });

    const providers = compose(sort.array(nodes, edges).map(key => {
      return function* (next) {
        yield registry[key].call(this, next);
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
