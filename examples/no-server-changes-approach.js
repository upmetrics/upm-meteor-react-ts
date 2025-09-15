// Solution: Direct collection updates without server methods
// This mimics your Angular + Meteor approach more closely

import Meteor from '@nyby/meteor-react-js';

// Your existing BusinessSettingsCollection
const BusinessSettingsCollection = new Meteor.Mongo.Collection('businessSettings');

const saveAiPreferences = async (data) => {
    setProcessing(true);

    try {
        // Update user preferences first
        userService.updateUserData({
            'preferences.hideAI': data.hideAI,
            'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces
        }, async function () {
            console.log("data", data);

            if (data.applyToAllWorkspaces) {
                // SOLUTION: Use direct collection updates like your Angular version
                // This approach doesn't require server method changes
                
                let successCount = 0;
                let totalCount = existingWorkspaces.length;

                // Process updates sequentially to avoid overwhelming the connection
                for (const workspace of existingWorkspaces) {
                    try {
                        // Use the standard collection.update method that should work 
                        // with your existing Meteor server setup
                        await new Promise((resolve, reject) => {
                            BusinessSettingsCollection.update(
                                workspace._id,  // selector
                                {
                                    $set: {
                                        'ai.hideAI': data.hideAI
                                    }
                                },
                                (err) => {
                                    if (err) {
                                        console.error(`Failed to update workspace ${workspace._id}:`, err);
                                        reject(err);
                                    } else {
                                        successCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error(`Error updating workspace ${workspace._id}:`, error);
                        // Continue with next workspace even if one fails
                    }
                }

                console.log(`Updated ${successCount} out of ${totalCount} workspaces`);
                
                if (successCount === totalCount) {
                    notificationsService.success(`Successfully updated all ${totalCount} workspaces`);
                } else if (successCount > 0) {
                    notificationsService.warning(`Updated ${successCount} out of ${totalCount} workspaces`);
                } else {
                    notificationsService.error('Failed to update any workspaces');
                }
            }
        });

        onClose();
        notificationsService.success('MOD_SETTING_MANAGE_AI.APPLIED_SUCCESSFULLY');
        if (onClose) onClose();

    } catch (error) {
        console.error("Error updating AI settings:", error);
        notificationsService.error('Failed to update AI settings');
    } finally {
        setProcessing(false);
    }
};

// Alternative approach: Batch the updates for better performance
const saveAiPreferencesBatched = async (data) => {
    setProcessing(true);

    try {
        userService.updateUserData({
            'preferences.hideAI': data.hideAI,
            'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces
        }, async function () {
            if (data.applyToAllWorkspaces) {
                // Process in smaller batches to avoid overwhelming the connection
                const BATCH_SIZE = 5;
                let successCount = 0;
                let totalCount = existingWorkspaces.length;

                for (let i = 0; i < existingWorkspaces.length; i += BATCH_SIZE) {
                    const batch = existingWorkspaces.slice(i, i + BATCH_SIZE);
                    
                    // Process current batch in parallel
                    const batchPromises = batch.map(workspace => 
                        new Promise((resolve) => {
                            BusinessSettingsCollection.update(
                                workspace._id,
                                { $set: { 'ai.hideAI': data.hideAI } },
                                (err) => {
                                    if (err) {
                                        console.error(`Failed to update workspace ${workspace._id}:`, err);
                                        resolve({ success: false, id: workspace._id, error: err });
                                    } else {
                                        successCount++;
                                        resolve({ success: true, id: workspace._id });
                                    }
                                }
                            );
                        })
                    );

                    // Wait for current batch to complete before processing next batch
                    await Promise.all(batchPromises);
                    
                    // Small delay between batches to be gentle on the server
                    if (i + BATCH_SIZE < existingWorkspaces.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                console.log(`Batch processing completed: ${successCount}/${totalCount} successful`);
                
                if (successCount === totalCount) {
                    notificationsService.success(`Successfully updated all ${totalCount} workspaces`);
                } else if (successCount > 0) {
                    notificationsService.warning(`Updated ${successCount} out of ${totalCount} workspaces`);
                } else {
                    notificationsService.error('Failed to update any workspaces');
                }
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

// If you want to make it even more similar to your Angular approach,
// you can also directly use Meteor.call if your server has methods
const saveAiPreferencesWithMeteorCall = async (data) => {
    setProcessing(true);

    try {
        userService.updateUserData({
            'preferences.hideAI': data.hideAI,
            'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces
        }, async function () {
            if (data.applyToAllWorkspaces) {
                // Use Meteor.call if you have existing server methods
                for (const workspace of existingWorkspaces) {
                    try {
                        await new Promise((resolve, reject) => {
                            // This assumes you have a server method that handles updates
                            // Replace 'updateBusinessSetting' with your actual method name
                            Meteor.call('updateBusinessSetting', {
                                _id: workspace._id,
                                update: { $set: { 'ai.hideAI': data.hideAI } }
                            }, (err, result) => {
                                if (err) {
                                    console.error(`Failed to update workspace ${workspace._id}:`, err);
                                    reject(err);
                                } else {
                                    resolve(result);
                                }
                            });
                        });
                    } catch (error) {
                        console.error(`Error updating workspace ${workspace._id}:`, error);
                    }
                }
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

export { 
    saveAiPreferences, 
    saveAiPreferencesBatched, 
    saveAiPreferencesWithMeteorCall 
};
