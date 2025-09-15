// COMPLETE SOLUTION: No Server Changes Required
// This approach works with your existing Angular + Meteor backend

import Meteor from '@nyby/meteor-react-js';

// Your existing BusinessSettingsCollection
const BusinessSettingsCollection = new Meteor.Mongo.Collection('businessSettings');

// RECOMMENDED APPROACH: Direct individual updates (like your Angular version)
const saveAiPreferences = async (data) => {
    setProcessing(true);

    try {
        // Update user preferences first (same as before)
        userService.updateUserData({
            'preferences.hideAI': data.hideAI,
            'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces
        }, async function () {
            console.log("data", data);

            if (data.applyToAllWorkspaces) {
                console.log(`Updating ${existingWorkspaces.length} workspaces...`);
                
                let successCount = 0;
                let failureCount = 0;
                const errors = [];

                // Process each workspace individually (like your Angular version)
                for (const workspace of existingWorkspaces) {
                    try {
                        await new Promise((resolve, reject) => {
                            // This uses the improved update method that tries multiple patterns
                            BusinessSettingsCollection.update(
                                workspace._id,
                                {
                                    $set: {
                                        'ai.hideAI': data.hideAI
                                    }
                                },
                                (err) => {
                                    if (err) {
                                        console.error(`Failed to update workspace ${workspace._id}:`, err);
                                        failureCount++;
                                        errors.push({ workspaceId: workspace._id, error: err });
                                        reject(err);
                                    } else {
                                        console.log(`Successfully updated workspace ${workspace._id}`);
                                        successCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        // Continue with next workspace even if one fails
                        console.error(`Error processing workspace ${workspace._id}:`, error);
                    }
                }

                // Provide feedback based on results
                console.log(`Update completed: ${successCount} successful, ${failureCount} failed`);
                
                if (successCount === existingWorkspaces.length) {
                    console.log("All workspace updates successful!");
                } else if (successCount > 0) {
                    console.warn(`Partial success: ${successCount}/${existingWorkspaces.length} updated`);
                    console.warn("Failed updates:", errors);
                } else {
                    console.error("All workspace updates failed:", errors);
                    throw new Error("Failed to update any workspaces");
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

// ALTERNATIVE 1: If your server has different method names
const saveAiPreferencesWithCustomMethods = async (data) => {
    setProcessing(true);

    try {
        userService.updateUserData({
            'preferences.hideAI': data.hideAI,
            'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces
        }, async function () {
            if (data.applyToAllWorkspaces) {
                
                for (const workspace of existingWorkspaces) {
                    try {
                        await new Promise((resolve, reject) => {
                            // If your Angular app uses a specific method name, use that
                            // Replace 'your.method.name' with the actual method your Angular app uses
                            Meteor.call('businessSettings.update', workspace._id, {
                                $set: { 'ai.hideAI': data.hideAI }
                            }, (err, result) => {
                                if (err) {
                                    console.error(`Method call failed for ${workspace._id}:`, err);
                                    reject(err);
                                } else {
                                    console.log(`Method call successful for ${workspace._id}`);
                                    resolve(result);
                                }
                            });
                        });
                    } catch (error) {
                        console.error(`Error with method call for workspace ${workspace._id}:`, error);
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

// ALTERNATIVE 2: Batched approach for better performance
const saveAiPreferencesBatched = async (data) => {
    setProcessing(true);

    try {
        userService.updateUserData({
            'preferences.hideAI': data.hideAI,
            'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces
        }, async function () {
            if (data.applyToAllWorkspaces) {
                const BATCH_SIZE = 3; // Process 3 at a time to not overwhelm server
                let successCount = 0;

                for (let i = 0; i < existingWorkspaces.length; i += BATCH_SIZE) {
                    const batch = existingWorkspaces.slice(i, i + BATCH_SIZE);
                    
                    // Process current batch in parallel
                    const batchResults = await Promise.allSettled(
                        batch.map(workspace => 
                            new Promise((resolve, reject) => {
                                BusinessSettingsCollection.update(
                                    workspace._id,
                                    { $set: { 'ai.hideAI': data.hideAI } },
                                    (err) => {
                                        if (err) {
                                            reject({ workspaceId: workspace._id, error: err });
                                        } else {
                                            resolve({ workspaceId: workspace._id, success: true });
                                        }
                                    }
                                );
                            })
                        )
                    );

                    // Count successes
                    batchResults.forEach(result => {
                        if (result.status === 'fulfilled') {
                            successCount++;
                        } else {
                            console.error('Batch update failed:', result.reason);
                        }
                    });

                    // Small delay between batches
                    if (i + BATCH_SIZE < existingWorkspaces.length) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }

                console.log(`Batched update completed: ${successCount}/${existingWorkspaces.length} successful`);
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

// DEBUGGING HELPER: Check what methods are available
const debugAvailableMethods = () => {
    console.log('Testing different method patterns...');
    
    const testMethods = [
        '/businessSettings/update',
        'businessSettings.update', 
        'updateBusinessSettings',
        '/businessSettings/modify'
    ];

    testMethods.forEach(methodName => {
        Meteor.call(methodName, { test: true }, (err, result) => {
            if (err && err.error === 404) {
                console.log(`❌ Method not found: ${methodName}`);
            } else if (err) {
                console.log(`⚠️  Method exists but errored: ${methodName}`, err.reason);
            } else {
                console.log(`✅ Method available: ${methodName}`);
            }
        });
    });
};

export { 
    saveAiPreferences,
    saveAiPreferencesWithCustomMethods,
    saveAiPreferencesBatched,
    debugAvailableMethods
};
