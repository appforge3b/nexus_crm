import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const utils = require('jsdom/lib/jsdom/living/generated/utils.js');
const FileList = require('jsdom/lib/jsdom/living/generated/FileList.js');

let fileListReady = false;

function fileList(files) {
  if (!fileListReady) {
    FileList.install(window, ['Window']);
    fileListReady = true;
  }
  const wrapper = FileList.create(window);
  const impl = utils.implForWrapper(wrapper);
  for (const file of files) impl.push(file);
  return wrapper;
}

if (typeof globalThis.DataTransfer === 'undefined') {
  class DataTransferItemList {
    constructor(owner) {
      this._owner = owner;
      this._files = [];
    }

    add(file) {
      this._files.push(file);
    }

    get length() {
      return this._files.length;
    }
  }

  class DataTransferPolyfill {
    constructor() {
      this.items = new DataTransferItemList(this);
      this.effectAllowed = 'uninitialized';
      this.dropEffect = 'none';
      this.types = [];
      this._data = new Map();
    }

    setData(format, data) {
      const type = String(format);
      this._data.set(type, String(data));
      if (!this.types.includes(type)) this.types.push(type);
    }

    getData(format) {
      return this._data.get(String(format)) ?? '';
    }

    clearData(format) {
      if (format == null) {
        this._data.clear();
        this.types = [];
        return;
      }
      this._data.delete(String(format));
      this.types = this.types.filter((type) => type !== String(format));
    }

    get files() {
      return fileList(this.items._files);
    }
  }

  globalThis.DataTransfer = DataTransferPolyfill;
}

if (typeof globalThis.DragEvent === 'undefined') {
  class DragEventPolyfill extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.dataTransfer = init.dataTransfer ?? null;
    }
  }
  globalThis.DragEvent = DragEventPolyfill;
}
