# Changelog

## [1.5.0] - 2025-07-30

### Added

- **Bulk Operations Support**: Added `updateMany()` and `bulkUpdate()` methods to Collection class
    - `updateMany(selector, modifier, options, callback)`: Update multiple documents matching a selector without
      requiring local subscriptions
    - `bulkUpdate(updates, options, callback)`: Perform multiple different update operations in a single server call
- **TypeScript Support**: Updated TypeScript definitions to include new bulk operation methods
- **Documentation**: Added comprehensive examples and documentation for bulk operations in README.md

### Changed

- Enhanced Collection class to support server-side bulk operations
- Improved error handling for bulk operations with proper rollback support

### Technical Details

These new methods solve the common issue where developers need to update multiple documents without subscribing to each
document individually. This is particularly useful for:

- Updating workspace settings across multiple workspaces
- Bulk status changes
- Mass data migrations
- Any scenario where subscription overhead is undesirable

The methods use optimistic updates for better UI responsiveness while ensuring data consistency through proper error
handling and rollback mechanisms.

### Breaking Changes

None - this is a backward-compatible addition.

### Migration Guide

For developers currently using loops with individual `update()` calls:

**Before:**

```javascript
existingWorkspaces.forEach(workspace => {
  BusinessSettingsCollection.update(workspace._id, {
    $set: { 'ai.hideAI': hideAI }
  });
});
```

**After:**

```javascript
// Option 1: Using updateMany (recommended)
BusinessSettingsCollection.updateMany(
  { _id: { $in: existingWorkspaces.map(w => w._id) } },
  { $set: { 'ai.hideAI': hideAI } },
  (err, result) => {
    console.log(`Updated ${result.modifiedCount} documents`);
  }
);

// Option 2: Using bulkUpdate (for different operations per document)
const updates = existingWorkspaces.map(workspace => ({
  selector: { _id: workspace._id },
  modifier: { $set: { 'ai.hideAI': hideAI } }
}));

BusinessSettingsCollection.bulkUpdate(updates, (err, results) => {
  console.log('Bulk update completed:', results);
});
```
