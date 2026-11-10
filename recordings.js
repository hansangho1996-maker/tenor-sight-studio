// Store the latest take for each passage in the same browser as the practice log.
let recordingDatabase;
function openRecordings() {
  if (!recordingDatabase) {
    recordingDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('tenor-recordings', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('takes');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      recordingDatabase = null;
      throw error;
    });
  }
  return recordingDatabase;
}

async function useRecordings(mode, action) {
  const db = await openRecordings();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('takes', mode);
    const request = action(transaction.objectStore('takes'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

const getTake = id => useRecordings('readonly', store => store.get(id));
const putTake = (id, blob) => useRecordings('readwrite', store => store.put(blob, id));
const deleteTake = id => useRecordings('readwrite', store => store.delete(id));
