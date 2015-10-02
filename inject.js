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

function inject(fn, dependencies, key) {
  let provider = co.wrap(fn);
  return function* (next) {
    let ctx = this;
    const args = dependencies.map(dependency => {
      return dependency === 'next' ? next : ctx[dependency];
    });
    yield provider.apply(ctx, args).then(function(value) {
      if (key) {
        ctx[key] = ctx[key] || value;

        if (ctx[key]) {
          return;
        }

        throw new Error(`Dependency not provided! (did your middleware set this.${key}?)`);
      }
    });
    yield* next;
  };
}

module.exports = function(arg) {
  if (typeof arg === 'function') {
    const parameters = getParameterNames(arg);

    parameters.forEach(check);

    return inject(arg, parameters);
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
        registry[key] = inject(fn, parameters, key);
      } else {
        throw new Error(`${key} must be a provider function`);
      }
    });

    const dependencies = compose(sort.array(nodes, edges).map(key => {
      return registry[key];
    }));

    return function* (next) {
      yield dependencies;
      yield* next;
    };
  } else {
    throw new Error('inject() requires either a provider definition object or a dependency function');
  }
};
