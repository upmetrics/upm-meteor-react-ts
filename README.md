# Meteor React JS

This package is based on the `@meteorrn/core` package for React Native.
Some little adjustments to make it work in the browser. All credits for the
awesome work should go to the maintainers of the original package for React Native.
Feel free to comment, contribute and fix. A hook version
called `Meteor.useTracker` is also available.

A set of packages allowing you to connect your React app to your Meteor server,
and take advantage of Meteor-specific features like accounts, reactive data
trackers, etc. Compatible with the latest version of React.

[Full API Documentation](/docs/api.md)

## Installation

~~~
npm install --save @nyby/meteor-react-js
~~~

## Basic Usage

```javascript
import Meteor from '@nyby/meteor-react-js';

// "mycol" should match the name of the collection on your meteor server
let MyCol = new Meteor.Mongo.Collection('mycol');

// Note the /websocket after your URL
Meteor.connect('wss://myapp.meteor.com/websocket');

class App extends React.Component {
  render() {
    let { myThing } = this.props;

    return (
      <div>
        <span>Here is the thing: {myThing.name}</span>
      </div>
    );
  }
}

let AppContainer = Meteor.withTracker(() => {
  Meteor.subscribe('myThing');
  let myThing = MyCol.findOne();

  return {
    myThing,
  };
})(App);

export default AppContainer;
```

## Custom hooks

There are also custom hooks for managing subscriptions and calling Meteor methods implemented.

### Meteor.usePublication

```javascript
const [data, loading] = Meteor.usePublication({
  name: 'publication.name',
  params: { id: _id },
  fetch: () => MyCol.findOne({ _id: id }),
});
```

### Meteor.useMethod

```javascript
const { result, loading } = Meteor.useMethod('method.name', { id: _id });
```

## Bulk Operations

For scenarios where you need to update multiple documents without subscribing to each one individually, the package now
supports bulk operations with automatic fallback:

### Collection.updateMany

Updates multiple documents matching a selector without requiring local subscriptions. If the server method is not available, it automatically falls back to individual updates:

```javascript
// Update multiple documents by selector
BusinessSettingsCollection.updateMany(
  { _id: { $in: workspaceIds } }, // selector  
  { $set: { 'ai.hideAI': true } }, // modifier
  (err, result) => {
    if (err) {
      console.error('Update failed:', err);
    } else {
      console.log(`Updated ${result.modifiedCount} documents`);
      // Check for fallback warnings
      if (result.errors) {
        console.warn('Some updates failed:', result.errors);
      }
    }
  }
);
```

### Collection.bulkUpdate

Performs multiple different update operations in a single call with automatic fallback:

```javascript
// Prepare array of update operations
const updates = workspaces.map(workspace => ({
  selector: { _id: workspace._id },
  modifier: { $set: { 'ai.hideAI': hideAI } }
}));

// Execute bulk update
BusinessSettingsCollection.bulkUpdate(updates, (err, results) => {
  if (err) {
    console.error('Bulk update failed:', err);
  } else {
    console.log('Bulk update completed:', results);
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`${successCount} successful, ${failCount} failed`);
  }
});
```

### Automatic Fallback

Both methods automatically detect when the corresponding server methods (`/collectionName/updateMany` and `/collectionName/bulkUpdate`) are not available and fall back to using individual `update()` calls. This means:

- ✅ Works immediately without requiring server-side changes
- ✅ Optimal performance when server methods are implemented  
- ✅ Graceful degradation when server methods are missing
- ⚠️ Fallback only supports `_id` selectors for `updateMany`

**Note**: For best performance, implement the corresponding server methods as shown in `examples/server-methods.js`.

npm run prepare

npx rimraf dist

npx babel src --out-dir dist

npx copyfiles src/index.d.ts dist --up 1