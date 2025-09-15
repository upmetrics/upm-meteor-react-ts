// Test file for bulk operations
import { Collection } from '../src/Collection.js';

// Mock Data object for testing
const mockData = {
  waitDdpConnected: (callback) => callback(),
  calls: [],
};

// Mock call function
const mockCall = jest.fn((method, ...args) => {
  const callback = args[args.length - 1];
  if (typeof callback === 'function') {
    // Simulate successful server response
    setTimeout(() => {
      if (method.includes('updateMany')) {
        callback(null, { modifiedCount: 2, matchedCount: 2 });
      } else if (method.includes('bulkUpdate')) {
        callback(null, [
          { _id: 'id1', success: true },
          { _id: 'id2', success: true },
        ]);
      }
    }, 0);
  }
});

// Mock the imports
jest.mock('../src/Data.js', () => mockData);
jest.mock('../src/Call.js', () => mockCall);

describe('Collection Bulk Operations', () => {
  let collection;

  beforeEach(() => {
    // Mock the internal collection structure
    const mockInternalCollection = {
      name: 'testCollection',
      find: jest.fn(() => []),
      get: jest.fn(),
      upsert: jest.fn(),
      del: jest.fn(),
    };

    collection = new Collection('testCollection');
    collection._collection = mockInternalCollection;
  });

  describe('updateMany', () => {
    it('should call server method for updateMany', (done) => {
      const selector = { workspaceId: { $in: ['ws1', 'ws2'] } };
      const modifier = { $set: { 'ai.hideAI': true } };

      collection.updateMany(selector, modifier, (err, result) => {
        expect(err).toBeNull();
        expect(result.modifiedCount).toBe(2);
        expect(mockCall).toHaveBeenCalledWith('/testCollection/updateMany', selector, modifier, expect.any(Function));
        done();
      });
    });
  });

  describe('bulkUpdate', () => {
    it('should call server method for bulkUpdate', (done) => {
      const updates = [
        { selector: { _id: 'id1' }, modifier: { $set: { 'ai.hideAI': true } } },
        { selector: { _id: 'id2' }, modifier: { $set: { 'ai.hideAI': false } } },
      ];

      collection.bulkUpdate(updates, (err, results) => {
        expect(err).toBeNull();
        expect(results).toHaveLength(2);
        expect(mockCall).toHaveBeenCalledWith('/testCollection/bulkUpdate', updates, expect.any(Function));
        done();
      });
    });

    it('should return error for invalid updates parameter', (done) => {
      collection.bulkUpdate('invalid', (err) => {
        expect(err.error).toBe(400);
        expect(err.reason).toContain('expects an array');
        done();
      });
    });
  });
});
