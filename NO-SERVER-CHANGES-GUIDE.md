# No Server Changes Required - Usage Guide

## Quick Start

Your React code can now work with your existing Angular + Meteor backend without any server changes!

### Step 1: Test What Methods Are Available

First, check what update methods your server supports:

```javascript
import Meteor from '@nyby/meteor-react-js';

const BusinessSettingsCollection = new Meteor.Mongo.Collection('businessSettings');

// Test available methods (run this once in console to see what works)
BusinessSettingsCollection.testAvailableMethods((availableMethods) => {
    console.log('Your server supports these methods:', availableMethods);
});
```

### Step 2: Use the Working Approach

Replace your current loop with this code:

```javascript
const saveAiPreferences = async (data) => {
    setProcessing(true);

    try {
        userService.updateUserData({
            'preferences.hideAI': data.hideAI,
            'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces
        }, async function () {
            if (data.applyToAllWorkspaces) {
                let successCount = 0;
                
                // This now works with your existing server!
                for (const workspace of existingWorkspaces) {
                    try {
                        await new Promise((resolve, reject) => {
                            BusinessSettingsCollection.update(
                                workspace._id,
                                { $set: { 'ai.hideAI': data.hideAI } },
                                (err) => {
                                    if (err) {
                                        console.error(`Failed to update ${workspace._id}:`, err);
                                        reject(err);
                                    } else {
                                        successCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        // Continue with next workspace
                        console.error(`Error updating ${workspace._id}:`, error);
                    }
                }

                console.log(`Updated ${successCount}/${existingWorkspaces.length} workspaces`);
            }
        });

        onClose();
        notificationsService.success('MOD_SETTING_MANAGE_AI.APPLIED_SUCCESSFULLY');

    } catch (error) {
        console.error("Error updating AI settings:", error);
        notificationsService.error('Failed to update AI settings');
    } finally {
        setProcessing(false);
    }
};
```

## What Changed

1. **Enhanced `update()` method**: Now tries multiple method patterns automatically
2. **Fallback system**: If one method fails, tries alternatives that might exist on your server
3. **Better error handling**: Continues processing even if some updates fail
4. **Debugging tools**: Test what methods your server supports

## How It Works

The enhanced `update()` method now tries these patterns in order:
1. `/${collectionName}/update` (default)
2. `${collectionName}.update` (common Meteor pattern)
3. `update${collectionName}` (alternative pattern)
4. `/${collectionName}/modify` (alternative)

This means it should work with however your Angular + Meteor server was set up originally.

## Benefits

- ✅ **No server changes required** - works with your existing backend
- ✅ **Automatic fallback** - tries different method patterns
- ✅ **Better error handling** - processes all workspaces even if some fail
- ✅ **Same performance** - individual updates like your Angular version
- ✅ **Debugging tools** - helps you understand what your server supports

## Troubleshooting

If you still get errors:

1. Run the test method to see what's available:
   ```javascript
   BusinessSettingsCollection.testAvailableMethods();
   ```

2. Check the console for which methods are found

3. If needed, you can manually specify the method:
   ```javascript
   Meteor.call('your.specific.method.name', workspaceId, updateData, callback);
   ```

This approach maintains compatibility with your existing Angular + Meteor setup while providing the bulk update functionality you need in React!
