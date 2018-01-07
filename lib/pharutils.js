/**
 * Utilities for working with Phar archives
 * https://github.com/FaigerSYS/PharUtils.js
 * @license PharUtils.js [The MIT License]
 * @copyright FaigerSYS 2018
 */

(function() {
	var error = false;
	if (typeof Zlib.RawInflate === 'undefined') {
		error = true;
		console.error('Zlib.RawInflate not found!');
	}
	if (typeof Zlib.RawDeflate === 'undefined') {
		error = true;
		console.error('Zlib.RawDeflate not found!');
	}
	if (typeof Hashes === 'undefined') {
		error = true;
		console.error('Hashes not found!');
	}
	if (error) {
		throw Error('Required libraries are not installed!');
	}
	
	function crc32(str) {
		var makeCRCTable = function() {
			var c;
			var crcTable = [];
			for (var n =0; n < 256; n++) {
				c = n;
				for (var k = 0; k < 8; k++) {
					c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
				}
				crcTable[n] = c;
			}
			return crcTable;
		}
		var crcTable = window.PharUtils_crcTable || (window.PharUtils_crcTable = makeCRCTable());
		
		var crc = 0 ^ (-1);
		for (var i = 0; i < str.length; i++ ) {
			crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
		}
		return (crc ^ (-1)) >>> 0;
	}
	
	function toUint8Array(str) {
		var u8a = new Uint8Array(str.length);
		for (var i = 0; i < str.length; i++){
			u8a[i] = str.charCodeAt(i);
		}
		return u8a;
	}
	
	function fromUint8Array(u8a) {
		var str = '';
		for (var i = 0; i < u8a.length; i++){
			str += String.fromCharCode(u8a[i]);
		}
		return str;
	}
	
	var PharUtils = {
		/**
		 * Compression flags
		 * @property {number} COMPRESSION_NONE
		 * @property {number} COMPRESSION_GZ
		 * @property {number} COMPRESSION_BZIP2
		 * @readonly
		 */
		COMPRESSION_NONE: 0x0000,
		COMPRESSION_GZ: 0x1000,
		COMPRESSION_BZIP2: 0x2000,
		SUPPORTED_COMPRESSION: [0x0000, 0x1000], // COMPRESSION_NONE and COMPRESSION_GZ
		
		/**
		 * Signature types
		 * @property {number} SIGNATURE_MD5
		 * @property {number} SIGNATURE_SHA1
		 * @property {number} SIGNATURE_SHA256
		 * @property {number} SIGNATURE_SHA512
		 * @readonly
		 */
		SIGNATURE_MD5: 0x01,
		SIGNATURE_SHA1: 0x02,
		SIGNATURE_SHA256: 0x04,
		SIGNATURE_SHA512: 0x08,
		
		/**
		 * End of the phar file (magic)
		 * @property {string} END_MAGIC
		 * @readonly
		 */
		END_MAGIC: 'GBMB',
		
		/**
		 * End of the stub
		 * @property {string} STUB_END
		 * @readonly
		 */
		STUB_END: '__HALT_COMPILER(); ?>\r\n',
		
		/**
		 * Binary utils
		 * @member PharUtils
		 * @class Binary
		 */
		Binary: {
			/**
			 * Reads little-endian 32-bit number
			 * @property {string} buffer
			 * @returns {number}
			 */
			readLInt: function(buffer) {
				var num = 0;
				for (var i = 0; i < 4; i++) {
					num |= buffer.charCodeAt(i) << (8 * i);
				}
				return num >>> 0;
			},
			
			/**
			 * Writes little-endian 32-bit number
			 * @property {number} num
			 * @returns {string}
			 */
			writeLInt: function(num) {
				var buffer = '';
				for (var i = 0; i < 4; i++) {
					buffer += String.fromCharCode((num >> (8 * i)) & 0xff);
				}
				return buffer;
			},
			
			/**
			 * Reads little-endian 16-bit number
			 * @property {string} buffer
			 * @returns {number}
			 */
			readLShort: function(buffer) {
				var num = 0;
				for (var i = 0; i < 2; i++) {
					num |= buffer.charCodeAt(i) << (8 * i);
				}
				return num;
			},
			
			/**
			 * Writes little-endian 16-bit number
			 * @property {number} num
			 * @returns {string}
			 */
			writeLShort: function(num) {
				var buffer = '';
				for (var i = 0; i < 2; i++) {
					buffer += String.fromCharCode((num >> (8 * i)) & 0xff);
				}
				return buffer;
			}
		},
		
		/**
		 * Binary buffer
		 * @member PharUtils
		 * @class BinaryBuffer
		 * @constructor
		 * @property {string} buffer - buffer data
		 */
		BinaryBuffer: function(buffer) {
			this.get = function(length) {
				if (length < 0) {
					length = Math.max(0, this.buffer.length - this.offset);
				}
				if (length == 0) {
					return "";
				}
				
				if ((this.offset += length) > this.buffer.length) {
					throw Error('Buffer is accessed out of bounds!');
				}
				
				return this.buffer.substring(this.offset - length, this.offset);
			};
			
			this.put = function(data) {
				this.buffer += data;
			};
			
			this.getLInt = function() {
				return PharUtils.Binary.readLInt(this.get(4));
			};
			
			this.putLInt = function(number) {
				this.put(PharUtils.Binary.writeLInt(number));
			};
			
			this.getLShort = function() {
				return PharUtils.Binary.readLShort(this.get(2));
			};
			
			this.putLShort = function(number) {
				this.put(PharUtils.Binary.writeLShort(number));
			};
			
			this.getString = function() {
				return this.get(this.getLInt());
			};
			
			this.putString = function(data) {
				this.putLInt(data.length);
				this.put(data);
			};
			
			this.buffer = buffer || '';
			this.offset = 0;
			
			return this;
		},
		
		/**
		 * Phar class
		 * @member PharUtils
		 * @class Phar
		 * @constructor
		 * @property {object} options - phar options
		 * @property {string}               options.alias          - alias for the phar
		 * @property {string}               options.stub           - bootstrap stub
		 * @property {number}               options.signature_type - signature type
		 * @property {string}               options.metadata       - metadata
		 * @property {PharUtils.PharFile[]} options.files          - files
		 * @property {number}               options.flags          - phar flags
		 */
		Phar: function(options) {
			/**
			 * Get stub
			 * @returns {string}
			 */
			this.getStub = function() {
				return this.stub;
			};
			
			/**
			 * Set stub
			 * @property {string} stub
			 */
			this.setStub = function(stub) {
				var pos = stub.toLowerCase().indexOf('__halt_compiler();');
				if (pos == -1) {
					throw Error('Stub is invalid!');
				}
				
				this.stub = stub.substring(0, pos) + PharUtils.STUB_END;
			};
			
			/**
			 * Get alias
			 * @returns {string}
			 */
			this.getAlias = function() {
				return this.alias;
			};
			
			/**
			 * Set alias
			 * @property {string} alias
			 */
			this.setAlias = function(alias) {
				this.alias = alias;
				return this;
			};
			
			/**
			 * Get signature type
			 * @returns {number}
			 */
			this.getSignatureType = function() {
				return this.signature_type;
			};
			
			/**
			 * Set signature type
			 * @property {number} type
			 */
			this.setSignatureType = function(type) {
				if (type != PharUtils.SIGNATURE_MD5 && type != PharUtils.SIGNATURE_SHA1 && type != PharUtils.SIGNATURE_SHA256 && type != PharUtils.SIGNATURE_SHA512) {
					throw Error('Unknown signature type given!');
				}
				
				this.signature_type = type;
				return this;
			};
			
			/**
			 * Get metadata
			 * @returns {string}
			 */
			this.getMetadata = function() {
				return this.metadata;
			};
			
			/**
			 * Set metadata
			 * @property {string} meta
			 */
			this.setMetadata = function(meta) {
				this.metadata = meta;
				return this;
			};
			
			/**
			 * Add file
			 * @property {PharUtils.PharFile} file
			 */
			this.addFile = function(file) {
				if (file instanceof PharUtils.PharFile) {
					this.removeFile(file.getName());
					this.files.push(file);
				}
				return this;
			};
			
			/**
			 * Get file by name
			 * @property {string} name
			 * @returns {?PharUtils.PharFile}
			 */
			this.getFile = function(name) {
				for (var i in this.files) {
					if (this.files[i].getName() == name) {
						return this.files[i];
					}
				}
			};
			
			/**
			 * Remove file
			 * @property {string} name
			 */
			this.removeFile = function(name) {
				for (var i in this.files) {
					if (this.files[i].getName() == name) {
						delete this.files[i];
						break;
					}
				}
				return this;
			};
			
			/**
			 * Get all files
			 * @returns {PharUtils.PharFile[]}
			 */
			this.getFiles = function() {
				return this.files.slice(0);
			};
			
			/**
			 * Set all files
			 * @property {PharUtils.PharFile[]} files
			 */
			this.setFiles = function(files) {
				this.files = { };
				for (var n in files) {
					this.addFile(files[n]);
				}
				return this;
			};
			
			/**
			 * Get files count
			 * @returns {number}
			 */
			this.getFilesCount = function() {
				return this.files.length;
			};
			
			/**
			 * Get phar flags
			 * @returns {number}
			 */
			this.getFlags = function() {
				return this.flags;
			};
			
			/**
			 * Set phar flags
			 * @property {number} flags
			 */
			this.setFlags = function(flags) {
				this.flags = flags;
				return this;
			};
			
			/**
			 * Get manifest API version
			 * @returns {number}
			 */
			this.getManifestApi = function() {
				return this.manifest_api;
			};
			
			/**
			 * Set manifest API version
			 * @property {number} api
			 */
			this.setManifestApi = function(api) {
				this.manifest_api = api;
				return this;
			};
			
			/**
			 * Load phar from contents
			 * @params {(string|Uint8Array)} buffer - phar contents
			 */
			this.loadPharData = function(buffer) {
				if (buffer instanceof Uint8Array) {
					buffer = fromUint8Array(buffer);
				}
				
				var pos = buffer.length - 4;
				if (buffer.substring(pos) != PharUtils.END_MAGIC) {
					throw new Error('Phar is corrupted! (magic corrupt)');
				}
				pos -= 4;
				
				var signature_type = PharUtils.Binary.readLInt(buffer.substring(pos, pos + 4));
				switch (signature_type) {
					case PharUtils.SIGNATURE_MD5:
						var hash_len = 16;
						var hasher = new Hashes.MD5({utf8: false});
						break;
					
					case PharUtils.SIGNATURE_SHA1:
						var hash_len = 20;
						var hasher = new Hashes.SHA1({utf8: false});
						break;
					
					case PharUtils.SIGNATURE_SHA256:
						var hash_len = 32;
						var hasher = new Hashes.SHA256({utf8: false});
						break;
					
					case PharUtils.SIGNATURE_SHA512:
						var hash_len = 64;
						var hasher = new Hashes.SHA512({utf8: false});
						break;
					
					default:
						throw Error('Unknown signature type detected!');
				}
				var hash = buffer.substring(pos - hash_len, pos);
				buffer = buffer.substring(0, pos - hash_len);
				if (hasher.raw(buffer) != hash) {
					throw Error('Phar has a broken signature!');
				}
				
				var stub_len = buffer.indexOf(PharUtils.STUB_END);
				if (stub_len == -1) {
					throw Error('Stub not found!');
				}
				stub_len += PharUtils.STUB_END.length;
				
				buffer = new PharUtils.BinaryBuffer(buffer);
				
				this.stub = buffer.get(stub_len);
				
				var manifest_buffer = new PharUtils.BinaryBuffer(buffer.getString());
				var files_count = manifest_buffer.getLInt();
				this.manifest_api = manifest_buffer.getLShort();
				this.flags = manifest_buffer.getLInt();
				this.alias = manifest_buffer.getString();
				this.metadata = manifest_buffer.getString();
				
				this.files = [];
				for (var i = 0; i < files_count; i++) {
					var options = { };
					
					var filename = manifest_buffer.getString();
					manifest_buffer.offset += 4; // uncompressed file size
					options.timestamp = manifest_buffer.getLInt();
					var size = manifest_buffer.getLInt();
					var readed_crc32 = manifest_buffer.getLInt();
					var flags = manifest_buffer.getLInt();
					options.permission = flags & 0xfff;
					options.compression_type = flags & 0xf000;
					options.metadata = manifest_buffer.getString();
					options.is_compressed = true;
					
					var file = new PharUtils.PharFile(filename, buffer.get(size), options);
					if (readed_crc32 != crc32(file.getContents())) {
						throw Error('Phar is corrupted! (file corrupt)');
					}
					
					this.addFile(file);
				}
				
				return this;
			};
			
			/**
			 * Save phar file contents
			 * @params {boolean} as_u8a - save result as Uint8Array
			 * @returns {(string|Uint8Array)} - phar contents
			 */
			this.savePharData = function(as_u8a) {
				if (!this.getFilesCount()) {
					throw Error('Phar must have at least one file!');
				}
				
				var buffer = new PharUtils.BinaryBuffer();
				var manifest_buffer = new PharUtils.BinaryBuffer();
				
				buffer.put(this.stub);
				
				manifest_buffer.putLInt(this.getFilesCount());
				manifest_buffer.putLShort(this.manifest_api);
				manifest_buffer.putLInt(this.flags);
				manifest_buffer.putString(this.alias);
				manifest_buffer.putString(this.metadata);
				
				var all_contents = '';
				for (var i in this.files) {
					var file = this.files[i];
					var contents = file.getCompressedContents();
					
					manifest_buffer.putString(file.getName());
					manifest_buffer.putLInt(file.getSize());
					manifest_buffer.putLInt(file.getTimestamp());
					manifest_buffer.putLInt(contents.length);
					manifest_buffer.putLInt(crc32(file.getContents()));
					manifest_buffer.putLInt(file.getPharFlags());
					manifest_buffer.putString(file.getMetadata());
					
					all_contents += contents;
				}
				
				buffer.putString(manifest_buffer.buffer, 4);
				buffer.put(all_contents);
				all_contents = null;
				
				switch (this.signature_type) {
					case PharUtils.SIGNATURE_MD5:
						var hasher = new Hashes.MD5({utf8: false});
						break;
					
					case PharUtils.SIGNATURE_SHA1:
						var hasher = new Hashes.SHA1({utf8: false});
						break;
					
					case PharUtils.SIGNATURE_SHA256:
						var hasher = new Hashes.SHA256({utf8: false});
						break;
					
					case PharUtils.SIGNATURE_SHA512:
						var hasher = new Hashes.SHA512({utf8: false});
						break;
					
					default:
						throw Error('Unknown signature type detected!');
				}
				var hash = hasher.raw(buffer.buffer);
				buffer.put(hash);
				buffer.putLInt(this.signature_type, 4);
				buffer.put(PharUtils.END_MAGIC);
				
				if (as_u8a) {
					return toUint8Array(buffer.buffer);
				} else {
					return buffer.buffer;
				}
			};
			
			options = options || { };
			
			this.alias = options.alias || '';
			this.setStub(options.stub || '<?php ' + PharUtils.STUB_END);
			this.setSignatureType(options.signature_type || PharUtils.SIGNATURE_SHA1);
			this.metadata = options.metadata || '';
			this.setFiles(options.files || []);
			this.flags = options.flags || 0x10000;
			this.manifest_api = options.manifest_api || 17;
			
			return this;
		},
		
		/**
		 * A single file within a phar archive
		 * @member PharUtils
		 * @class PharFile
		 * @constructor
		 * @property {string} name     - filename (path)
		 * @property {string} contents - file contents
		 * @property {object} options  - file options
		 * @property {string} options.compression_type - compression type
		 * @property {string} options.is_compressed    - is given contents already compressed
		 * @property {number} options.timestamp        - timestamp of the file
		 * @property {string} options.metadata         - file metadata
		 * @property {number} options.permission       - file permission
		 */
		PharFile: function(name, contents, options) {
			/**
			 * Get filename (path)
			 * @returns {string}
			 */
			this.getName = function() {
				return this.name;
			};
			
			/**
			 * Set filename (path)
			 * @property {string} name
			 */
			this.setName = function(name) {
				this.name = name;
			};
			
			/**
			 * Get file contents
			 * @returns {string}
			 */
			this.getContents = function() {
				return this.contents;
			};
			
			/**
			 * Set file contents
			 * @property {string} contents
			 * @property {boolean} is_compressed - is given contents already compressed
			 */
			this.setContents = function(contents, is_compressed) {
				if (is_compressed) {
					switch (this.compression_type) {
						case PharUtils.COMPRESSION_NONE:
							this.contents = contents;
							break;
						
						case PharUtils.COMPRESSION_GZ:
							try {
								this.contents = fromUint8Array((new Zlib.RawInflate(toUint8Array(contents))).decompress());
							} catch (error) {
								throw Error('Zlib.RawInflate error: ' + error);
							}
							break;
						
						default:
							throw Error('Unsupported compression type detected!');
					}
				} else {
					this.contents = contents;
				}
				
				return this;
			};
			
			/**
			 * Get file compressed contents
			 * @returns {string}
			 */
			this.getCompressedContents = function() {
				switch (this.compression_type) {
					case PharUtils.COMPRESSION_GZ:
						try {
							return fromUint8Array((new Zlib.RawDeflate(toUint8Array(this.contents))).compress());
						} catch (error) {
							throw Error('Zlib.RawDeflate error: ' + error);
						}
					
					default:
						return this.contents;
				}
			};
			
			/**
			 * Get file size
			 * @returns {number}
			 */
			this.getSize = function() {
				return this.getContents().length;
			};
			
			/**
			 * Get file compressed size
			 * @returns {string}
			 */
			this.getComressedSize = function() {
				return this.getCompressedContents().length;
			};
			
			/**
			 * Get compression type
			 * @returns {number}
			 */
			this.getCompressionType = function() {
				return this.compression_type;
			};
			
			/**
			 * Set compression type
			 * @property {number} type
			 */
			this.setCompressionType = function(type) {
				if (PharUtils.SUPPORTED_COMPRESSION.indexOf(type) == -1) {
					throw Error('(' + type + ') compression type is not supported!');
				}
				
				this.compression_type = type;
				return this;
			};
			
			/**
			 * Get file permission
			 * @returns {number}
			 */
			this.getPermission = function() {
				return this.permission;
			};
			
			/**
			 * Set file permission
			 * @property {number} permission
			 */
			this.setPermission = function(permission) {
				if (permission > 4095 || perm < 0) {
					throw Error('Permission flag is incorrect!');
				}
				
				this.permission = permission;
				return this;
			};
			
			/**
			 * Get phar flags
			 * @returns {number}
			 */
			this.getPharFlags = function() {
				return (this.permission | this.compression_type);
			};
			
			/**
			 * Get file timestamp
			 * @returns {number}
			 */
			this.getTimestamp = function() {
				return this.timestamp;
			};
			
			/**
			 * Set file timestamp
			 * @property {number} timestamp
			 */
			this.setTimestamp = function(timestamp) {
				if (time < 0) {
					time = Date.now() / 1000 | 0;
				}
				
				this.timestamp = timestamp;
				return this;
			};
			
			/**
			 * Get file metadata
			 * @returns {number}
			 */
			this.getMetadata = function() {
				return this.metadata;
			};
			
			/**
			 * Set file metadata
			 * @property {string} metadata
			 */
			this.setMetadata = function(metadata) {
				this.metadata = metadata;
				return this;
			};
			
			options = options || { };
			
			this.name = name || 'newfile';
			this.setCompressionType(options.compression_type || PharUtils.COMPRESSION_NONE);
			this.setContents(contents || '', options.is_compressed || false);
			this.setTimestamp(options.timestamp || -1);
			this.setPermission(options.permission || 438); // 0666
			this.metadata = options.metadata || '';
			
			return this;
		}
	};
	
	if (typeof Zlib.Zip !== 'undefined' || typeof Zlib.Unzip !== 'undefined') {
		/**
		 * Zip to Phar converter and vice versa
		 * @member PharUtils
		 * @class PharZipConverter
		 */
		PharUtils.PharZipConverter = { 
			
			/**
			 * Convert Phar to Zip
			 * @static
			 * @property {PharUtils.Phar} phar
			 * @returns {Zlib.Zip} - zip data
			 */
			toZip: function(phar) {
				var zip = new Zlib.Zip();
				
				var files = phar.getFiles();
				for (var i in files) {
					var time = new Date();
					time.setTime(files[i].getTimestamp() * 1000);
					
					zip.addFile(toUint8Array(files[i].getContents()), {
						filename: toUint8Array(files[i].getName()),
						date: time
					});
				}
				
				return zip;
			},
			
			/**
			 * Convert Zip to Phar
			 * @static
			 * @property {Zlib.Unzip} zip
			 * @returns {PharUtils.Phar}
			 */
			toPhar: function(zip) {
				var phar = new PharUtils.Phar();
				
				var files = zip.getFilenames();
				try {
					for (var i in files) {
						phar.addFile(new PharUtils.PharFile(files[i], fromUint8Array(zip.decompress(files[i]))));
					}
				} catch (error) {
					throw Error('Zlib.Unzip decompression error: ' + error);
				}
				
				return phar;
			}
		};
	}
	
	window.PharUtils = PharUtils;
}());
