// Fallback approach using existing Meteor functionality

import Meteor from '@nyby/meteor-react-js';

// Your existing BusinessSettingsCollection
const BusinessSettingsCollection = new Meteor.Mongo.Collection('businessSettings');

const saveAiPreferencesWithFallback = async (data) => {
  setProcessing(true);

  try {
    // Update user preferences first
    userService.updateUserData(
      {
        'preferences.hideAI': data.hideAI,
        'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces,
      },
      async function () {
        console.log('data', data);

        if (data.applyToAllWorkspaces) {
          // FALLBACK APPROACH: Use Meteor.call with existing server methods
          
          // Option 1: If you have a custom server method for bulk updates
          try {
            const result = await new Promise((resolve, reject) => {
              Meteor.call('businessSettings.bulkUpdateAI', {
                workspaceIds: existingWorkspaces.map(w => w._id),
                hideAI: data.hideAI
              }, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
            console.log('Bulk update successful:', result);
          } catch (error) {
            console.error('Bulk update failed, falling back to individual updates:', error);
            
            // Option 2: Fallback to individual updates using existing update method
            let successCount = 0;
            let errorCount = 0;

            for (const workspace of existingWorkspaces) {
              try {
                await new Promise((resolve, reject) => {
                  // Use standard Meteor method call syntax
                  Meteor.call('businessSettings.update', workspace._id, {
                    $set: { 'ai.hideAI': data.hideAI }
                  }, (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
                successCount++;
              } catch (updateError) {
                console.error(`Failed to update workspace ${workspace._id}:`, updateError);
                errorCount++;
              }
            }

            console.log(`Updated ${successCount} workspaces, ${errorCount} failed`);
            
            if (errorCount > 0) {
              notificationsService.warning(`Updated ${successCount} workspaces, ${errorCount} failed`);
            }
          }
        }
      }
    );

    onClose();
    notificationsService.success('MOD_SETTING_MANAGE_AI.APPLIED_SUCCESSFULLY');
  } catch (error) {
    console.error('Error updating AI settings:', error);
    notificationsService.error('Failed to update AI settings');
  } finally {
    setProcessing(false);
  }
};

// Alternative: Use the Collection.update method directly (if your server supports it)
const saveAiPreferencesDirectUpdate = async (data) => {
  setProcessing(true);

  try {
    userService.updateUserData(
      {
        'preferences.hideAI': data.hideAI,
        'preferences.applyToAllWorkspaces': data.applyToAllWorkspaces,
      },
      async function () {
        if (data.applyToAllWorkspaces) {
          // Use individual updates with the existing Collection.update method
          const updatePromises = existingWorkspaces.map(workspace => 
            new Promise((resolve, reject) => {
              BusinessSettingsCollection.update(
                workspace._id,
                { $set: { 'ai.hideAI': data.hideAI } },
                (err) => {
                  if (err) {
                    console.error(`Failed to update ${workspace._id}:`, err);
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            })
          );

          try {
            await Promise.allSettled(updatePromises);
            console.log('All workspace updates completed');
          } catch (error) {
            console.error('Some workspace updates failed:', error);
          }
        }
      }
    );

    onClose();
    notificationsService.success('MOD_SETTING_MANAGE_AI.APPLIED_SUCCESSFULLY');
  } catch (error) {
    console.error('Error updating AI settings:', error);
    notificationsService.error('Failed to update AI settings');
  } finally {
    setProcessing(false);
  }
};

export { saveAiPreferencesWithFallback, saveAiPreferencesDirectUpdate };
