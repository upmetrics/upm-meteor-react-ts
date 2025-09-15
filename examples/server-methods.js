// Server-side Meteor methods to add to your main Meteor application

import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

// Add these methods to your server/methods.js or wherever you define your Meteor methods

Meteor.methods({
  // Method for updating multiple documents matching a selector
  '/businessSettings/updateMany': function(selector, modifier) {
    // Security check - ensure user is logged in
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in to update business settings');
    }

    // Validate parameters
    check(selector, Object);
    check(modifier, Object);

    try {
      // Replace 'BusinessSettings' with your actual collection name
      const result = BusinessSettings.rawCollection().updateMany(selector, modifier);
      
      return {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
        acknowledged: result.acknowledged
      };
    } catch (error) {
      console.error('Error in updateMany:', error);
      throw new Meteor.Error('update-failed', 'Failed to update business settings');
    }
  },

  // Method for bulk updates with different operations
  '/businessSettings/bulkUpdate': function(updates) {
    // Security check - ensure user is logged in
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in to update business settings');
    }

    // Validate parameters
    check(updates, [Object]);

    try {
      const results = updates.map((update, index) => {
        try {
          check(update.selector, Object);
          check(update.modifier, Object);

          // Replace 'BusinessSettings' with your actual collection name
          const result = BusinessSettings.rawCollection().updateOne(
            update.selector, 
            update.modifier
          );

          return {
            index,
            selector: update.selector,
            success: true,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
          };
        } catch (error) {
          return {
            index,
            selector: update.selector,
            success: false,
            error: error.message
          };
        }
      });

      return results;
    } catch (error) {
      console.error('Error in bulkUpdate:', error);
      throw new Meteor.Error('bulk-update-failed', 'Failed to perform bulk update');
    }
  }
});

// Alternative: If you prefer using the Meteor collection methods instead of rawCollection
/*
Meteor.methods({
  '/businessSettings/updateMany': function(selector, modifier) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    check(selector, Object);
    check(modifier, Object);

    // Find all matching documents first
    const matchingDocs = BusinessSettings.find(selector).fetch();
    let modifiedCount = 0;

    matchingDocs.forEach(doc => {
      try {
        BusinessSettings.update(doc._id, modifier);
        modifiedCount++;
      } catch (error) {
        console.error(`Failed to update document ${doc._id}:`, error);
      }
    });

    return {
      modifiedCount,
      matchedCount: matchingDocs.length
    };
  }
});
*/
