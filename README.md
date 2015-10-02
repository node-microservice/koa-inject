# microservice / koa-inject

minimalist dependency injection for koa applications

## usage

`app = koa(), app.use(inject(function* | object))`

### example

```javascript
var inject = require('@microservice/koa-inject');

app = koa();

// pass an object in to define provider functions
app.use(inject({
  // the dependency 'foo' will be the return value of the function
  foo: function() {
    console.log(this); // the koa context
    return 'foo!';
  },
  // providers are co.wrap'd so they can return promises, etc.
  bar: function() {
    return Promise.resolve('bar!');
  }
}));

// dependency consumer functions are normal middleware
// ... but with extra injected arguments!
app.use(inject(function* (next, foo) {
  console.log(foo); // 'foo!';
  yield* next;
}));
```

## advanced

```javascript
// they can also be middleware
app.use(inject({
  // but they need to set this[key] correctly before yielding
  baz: function* (next) {
    this.biff = 'bad'; // NO!
    this.baz = 'good'; // ok
    yield* next;
  },
  // and dependency consumers, too!
  blah: function* (next, baz) {
    this.blah = 'blah...' + baz;
    yield* next;
  }
}));
```
providers in a definition object are (automagically) run in order, depending on their dependencies.
