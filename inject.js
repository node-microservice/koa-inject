'use strict';
const getParameterNames = require('get-parameter-names'),
  series = require('co-series'),
  sort = require('toposort');

const providers = {};

function check(dependencies) {
  dependencies.forEach(dependency => {
    if (dependency === 'next' || dependency in providers) {
      return;
    }
  
    throw new Error('No provider for: ' + dependency);
  });
}

module.exports = function(arg) {
  if (typeof arg === 'function') {
    const parameters = getParameterNames(arg);

    check(parameters);

    return function* (next) {
      const deps = parameters.map(parameter => {
        if (parameter === 'next') {
          return next;
        } else {
          return this[parameter];
        }
      }, this);

      yield* arg.apply(this, deps);
    };
  }

  if (typeof arg === 'object' && arg) {
    const nodes = [],
      edges = [];

    Object.keys(arg).forEach(key => {
      if (key in providers) {
        throw new Error('Provider already registered: ' + key);
      }

      nodes.push(key);

      const fn = arg[key];

      if (typeof fn === 'function') {
        const parameters = getParameterNames(value);

        parameters.forEach(parameter => {
          if (parameter === 'next') {
            throw new Error('next is not available to a provider');
          }

          edges.push([parameter, key]);
        });

        providers[key] = function (ctx) {
          const deps = parameters.map(parameter => {
            return ctx[parameter];
          });

          return fn.apply(ctx, deps);
        };
      }

      throw new Error('Provider must be a function');
    });

    check(edges.map(edge => { return edge[0]; }));

    const sorted = sort.array(nodes, edges);

    return function* (next) {
      const ctx = this;
      yield Promise.all(sorted.map(series(function(key) {
        return Promise.resolve()
          .then(function() {
            if (ctx[key]) {
              return ctx[key];
            }

            return providers[key](ctx);
          })
          .then(function(value) {
            ctx[key] = value;
          });
      })));

      yield* next;
    };
  }

  throw new Error('inject() requires either a provider definition object or a dependency function');
};
