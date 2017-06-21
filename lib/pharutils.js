/**
 * Utilities for working with Phar archives
 * https://github.com/FaigerSYS/PharUtils.js
 * @license PharUtils.js [The MIT License]
 * @copyright FaigerSYS 2017
 */

(function() {
	var error = false;
	if (typeof Zlib.RawInflate === "undefined") {
		error = true;
		console.error("Zlib.RawInflate not found!");
	}
	if (typeof Zlib.RawDeflate === "undefined") {
		error = true;
		console.error("Zlib.RawDeflate not found!");
	}
	if (typeof Hashes === "undefined") {
		error = true;
		console.error("Hashes not found!");
	}
	if (error) {
		throw Error("Not all required libraries are installed!");
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
		var str = "";
		for (var i = 0; i < u8a.length; i++){
			str += String.fromCharCode(u8a[i]);
		}
		return str;
	}
	
	var PharUtils = {
		/**
		 * Compression flags for phar files
		 * @property {number} COMPRESSION_NONE
		 * @property {number} COMPRESSION_GZ
		 * @property {number} COMPRESSION_BZIP2
		 * @readonly
		 */
		COMPRESSION_NONE: 0x0000,
		COMPRESSION_GZ: 0x1000,
		COMPRESSION_BZIP2: 0x2000,
		
		/**
		 * Signature types for phar
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
		END_MAGIC: "GBMB",
		
		/**
		 * End of the stub
		 * @property {string} STUB_END
		 * @readonly
		 */
		STUB_END: "__HALT_COMPILER(); ?>\r\n",
		
		/**
		 * Phar file buffer
		 * @member PharUtils
		 * @class PharBuffer
		 * @constructor
		 * @property {string} buffer - buffer data
		 */
		PharBuffer: function(buffer) {
			/**
			 * Read bytes
			 * @property {number} len - length of bytes to read
			 * @returns {string}
			 */
			this.read = function(len) {
				if (len < 0) {
					len = Math.max(0, this.buffer.length - this.offset);
				}
				
				return this.buffer.substring(this.offset, this.offset += len);
			};
			
			/**
			 * Read number
			 * @property {number} len - length of bytes to read
			 * @returns {number}
			 */
			this.readNumber = function(len) {
				var ret = this.read(len);
				var data = "";
				var n;
				
				for (var i = ret.length - 1; i >= 0; i--) {
					n = ret.charCodeAt(i).toString(16);
					data += (n.length == 2 ? n : "0" + n);
				}
				
				return parseInt(data, 16);
			};
			
			/**
			 * Read string
			 * @property {number} len - length of number bytes to read
			 * @returns {string}
			 */
			this.readString = function(num_len) {
				return this.read(this.readNumber(num_len));
			};
			
			/**
			 * Write bytes
			 * @property {string} data - data to write
			 */
			this.write = function(data) {
				this.buffer += data;
				return this;
			};
			
			/**
			 * Write number
			 * @property {number} num - number to write
			 * @property {number} len - needed length in bytes
			 */
			this.writeNumber = function(num, len) {
				if (num == 0) {
					var data = "\0".repeat(len);
				} else {
					var hex = num.toString(16);
					if (hex.length % 2) {
						hex = "0" + hex;
					}
					
					var data = (hex.length / 2) < len ? "\0".repeat(len - (hex.length / 2)) : "";
					for (var i = 0; i < hex.length; i += 2) {
						data = String.fromCharCode(parseInt(hex.substring(i, i + 2), 16)) + data;
					}
				}
				
				this.write(data);
				return this;
			};
			
			/**
			 * Write string
			 * @property {number} data - string to write
			 * @property {number} num_len - needed length for number in bytes
			 */
			this.writeString = function(data, num_len) {
				this.writeNumber(data.length, num_len);
				this.write(data);
				return this;
			};
			
			this.buffer = buffer || "";
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
				var pos = stub.toLowerCase().indexOf("__halt_compiler();");
				if (pos == -1) {
					throw Error("Stub is invalid!");
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
			 * @property {string} aliases
			 */
			this.setAlias = function(aliases) {
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
					throw Error("Unknown signature type given!");
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
				this.files[file.getName()] = file;
				return this;
			};
			
			/**
			 * Get file
			 * @property {string} name
			 * @returns {?PharUtils.PharFile}
			 */
			this.getFile = function(name) {
				if (this.files[name]) {
					return this.files[name];
				}
			};
			
			/**
			 * Remove file
			 * @property {string} name
			 */
			this.removeFile = function(name) {
				delete this.files[name];
				return this;
			};
			
			/**
			 * Get all files
			 * @returns {PharUtils.PharFile[]}
			 */
			this.getFiles = function() {
				return this.files;
			};
			
			/**
			 * Set all files
			 * @property {PharUtils.PharFile[]} files
			 */
			this.setFiles = function(files) {
				this.files = { };
				for (var n in files) {
					this.files[files[n].getName()] = files[n];
				}
				
				return this;
			};
			
			/**
			 * Get files count
			 * @returns {number}
			 */
			this.getFilesCount = function() {
				return Object.keys(this.files).length;
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
			 * @params {string|Uint8Array} buffer - phar contents
			 */
			this.loadFromContents = function(buffer) {
				if (buffer instanceof Uint8Array) {
					buffer = fromUint8Array(buffer);
				}
				
				var st_pos = buffer.length - 8;
				var signature_type = new PharUtils.PharBuffer(buffer.substring(st_pos)).readNumber(4);
				switch (signature_type) {
					case PharUtils.SIGNATURE_MD5:
						var hash_len = 16;
						var hash_e = new Hashes.MD5({utf8: false});
						break;
					case PharUtils.SIGNATURE_SHA1:
						var hash_len = 20;
						var hash_e = new Hashes.SHA1({utf8: false});
						break;
					case PharUtils.SIGNATURE_SHA256:
						var hash_len = 32;
						var hash_e = new Hashes.SHA256({utf8: false});
						break;
					case PharUtils.SIGNATURE_SHA512:
						var hash_len = 64;
						var hash_e = new Hashes.SHA512({utf8: false});
						break;
					default:
						throw Error("Unknown signature type detected!");
				}
				
				var hash_bin = buffer.substring(st_pos - hash_len, st_pos);
				var hash = "";
				for (var i = 0; i < hash_bin.length; i++) {
					var h = hash_bin.charCodeAt(i).toString(16);
					hash += (h.length == 2 ? h : "0" + h);
				}
				buffer = buffer.substring(0, st_pos - hash_len);
				if (hash_e.hex(buffer) != hash) {
					throw Error("Phar has a broken signature!");
				}
				
				buffer = new PharUtils.PharBuffer(buffer);
				
				var stub_len = buffer.buffer.indexOf(PharUtils.STUB_END);
				if (stub_len == -1) {
					throw Error("Stub not found!");
				}
				stub_len += PharUtils.STUB_END.length;
				this.stub = buffer.read(stub_len);
				
				var man_len = buffer.readNumber(4);
				var manifest_buffer = new PharUtils.PharBuffer(buffer.read(man_len));
				if (manifest_buffer.buffer.length != man_len) {
					throw Error("Unexpected manifest end!");
				}
				
				var files_num = manifest_buffer.readNumber(4);
				this.manifest_api = manifest_buffer.readNumber(2);
				this.flags = manifest_buffer.readNumber(4);
				this.alias = manifest_buffer.readString(4);
				this.metadata = manifest_buffer.readString(4);
				
				this.files = [];
				for (var num = 0; num < files_num; num++) {
					var f_opts = { };
					
					var f_name = manifest_buffer.readString(4);
					manifest_buffer.readNumber(4); // real (uncompressed) file size
					f_opts.timestamp = manifest_buffer.readNumber(4);
					var f_size = manifest_buffer.readNumber(4);
					var f_crc32 = manifest_buffer.readNumber(4);
					var f_contents = buffer.read(f_size);
					
					if (f_crc32 != crc32(f_contents)) {
						throw new Error("Phar is corrupted! (file corrupt)");
					}
					
					var f_flags = manifest_buffer.readNumber(4);
					f_opts.permission = f_flags & 0xfff;
					f_opts.compression_type = f_flags & 0xf000;
					f_opts.metadata = manifest_buffer.readString(4);
					f_opts.is_compressed = true;
					
					this.files[f_name] = (new PharUtils.PharFile(f_name, f_contents, f_opts));
				}
				
				return this;
			};
			
			/**
			 * Save phar file contents
			 * @params {boolean} as_u8a - save result as Uint8Array
			 * @returns {string|Uint8Array} - phar contents
			 */
			this.saveAsContents = function(as_u8a) {
				if (!this.getFilesCount()) {
					throw Error("Phar must have at least 1 file!");
				}
				
				var buffer = new PharUtils.PharBuffer();
				var manifest_buffer = new PharUtils.PharBuffer();
				
				buffer.write(this.stub);
				
				manifest_buffer.writeNumber(this.getFilesCount(), 4);
				manifest_buffer.writeNumber(this.manifest_api, 2);
				manifest_buffer.writeNumber(this.flags, 4);
				manifest_buffer.writeString(this.alias, 4);
				manifest_buffer.writeString(this.metadata, 4);
				
				var file_contents = "";
				for (var i in this.files) {
					var file = this.files[i];
					
					manifest_buffer.writeString(file.getName(), 4);
					manifest_buffer.writeNumber(file.getSize(), 4);
					manifest_buffer.writeNumber(file.getTimestamp(), 4);
					manifest_buffer.writeNumber(file.getComressedSize(), 4);
					manifest_buffer.writeNumber(crc32(file.getContents()), 4);
					manifest_buffer.writeNumber(file.getPharFlags(), 4);
					manifest_buffer.writeString(file.getMetadata(), 4);
					
					file_contents += file.getCompressedContents();
				}
				
				buffer.writeString(manifest_buffer.buffer, 4);
				buffer.write(file_contents);
				
				switch (this.signature_type) {
					case PharUtils.SIGNATURE_MD5:
						var hash = new Hashes.MD5({utf8: false});
						break;
					case PharUtils.SIGNATURE_SHA1:
						var hash = new Hashes.SHA1({utf8: false});
						break;
					case PharUtils.SIGNATURE_SHA256:
						var hash = new Hashes.SHA256({utf8: false});
						break;
					case PharUtils.SIGNATURE_SHA512:
						var hash = new Hashes.SHA512({utf8: false});
						break;
					default:
						throw Error("Unknown signature type detected!");
				}
				
				var hash = hash.hex(buffer.buffer);
				var hash_bin = "";
				for (var i = hash.length - 2; i >= 0; i -= 2) {
					hash_bin = String.fromCharCode(parseInt(hash.substring(i, i + 2), 16)) + hash_bin;
				}
				buffer.write(hash_bin);
				buffer.writeNumber(this.signature_type, 4);
				buffer.write(PharUtils.END_MAGIC);
				
				if (as_u8a) {
					return toUint8Array(buffer.buffer);
				} else {
					return buffer.buffer;
				}
			};
			
			options = options || { };
			
			this.alias = options.alias || "";
			this.setStub(options.stub || "<?php " + PharUtils.STUB_END);
			this.setSignatureType(options.signature_type || PharUtils.SIGNATURE_SHA1);
			this.metadata = options.metadata || "";
			this.setFiles(options.files || { });
			this.flags  = options.flags || 0x10000;
			this.manifest_api = options.manifest_api || 17;
			
			return this;
		},
		
		/**
		 * A separate file in the phar
		 * @member PharUtils
		 * @class PharFile
		 * @constructor
		 * @property {string} name      - filename (path)
		 * @property {string} contents  - file contents
		 * @property {object} options   - file options
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
				switch (this.compression_type) {
					case PharUtils.COMPRESSION_NONE:
						this.contents = contents;
						this.compressed_contents = null;
						break;
					case PharUtils.COMPRESSION_GZ:
						try {
							if (is_compressed) {
								this.compressed_contents = contents;
								this.contents = fromUint8Array((new Zlib.RawInflate(toUint8Array(contents))).decompress());
							} else {
								this.contents = contents;
								this.compressed_contents = fromUint8Array((new Zlib.RawDeflate(toUint8Array(contents))).compress());
							}
						} catch (error) {
							throw Error("Zlib error: " + error);
						}
						break;
					case PharUtils.COMPRESSION_BZIP2:
						throw Error("BZIP2 compression is not supported yet!");
					default:
						throw Error("Unknown compression type!");
				}
				
				return this;
			};
			
			/**
			 * Get file compressed contents
			 * @returns {string}
			 */
			this.getCompressedContents = function() {
				return (this.compression_type == PharUtils.COMPRESSION_NONE ? this.contents : this.compressed_contents);
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
			 * Get file compression type
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
				if (type == this.compression_type) {
					return this;
				}
				
				switch (type) {
					case PharUtils.COMPRESSION_NONE:
						this.compressed_contents = null;
						break;
					case PharUtils.COMPRESSION_GZ:
						try {
							this.compressed_contents = fromUint8Array((new Zlib.RawDeflate(toUint8Array(this.contents))).compress());
						} catch (error) {
							throw Error("Zlib error: " + error);
						}
						break;
					case PharUtils.COMPRESSION_BZIP2:
						throw Error("BZIP2 compression is not supported yet!");
					default:
						throw Error("Unknown compression type!");
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
			 * @property {number} perm
			 */
			this.setPermission = function(perm) {
				if (perm > 4095 || perm < 0) {
					throw Error("Permission number is too " + (perm < 0 ? "small" : "large") + "!");
				}
				
				this.permission = perm;
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
			 * @property {number} time
			 */
			this.setTimestamp = function(time) {
				if (time < 0) {
					time = Date.now() / 1000 | 0;
				}
				
				this.timestamp = time;
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
			 * @property {string} meta
			 */
			this.setMetadata = function(meta) {
				this.metadata = meta;
				return this;
			};
			
			options = options || { };
			
			this.name = name || "NO_NAME";
			this.compression_type = options.compression_type || PharUtils.COMPRESSION_NONE;
			this.setContents(contents || "", options.is_compressed || false);
			this.setTimestamp(options.timestamp || -1);
			this.setPermission(options.permission || 438); // 0666
			this.metadata = options.metadata || "";
			
			return this;
		}
	};
	
	if (typeof Zlib.Zip !== "undefined" || typeof Zlib.Unzip !== "undefined") {
		/**
		 * Zip to Phar converter and vice versa
		 * @member PharUtils
		 * @class PharZipConverter
		 */
		PharUtils.PharZipConverter = { 
			
			/**
			 * Convert Phar to Zip
			 * @static
			 * @property {Phar} phar
			 * @params {boolean} as_u8a - save result as Uint8Array
			 * @returns {string} - zip data
			 */
			toZip: function(phar, as_u8a) {
				var zip = new Zlib.Zip();
				var files = phar.getFiles();
				
				for (var i in files) {
					zip.addFile(toUint8Array(files[i].getContents()), {filename: toUint8Array(files[i].getName())});
				}
				
				if (as_u8a) {
					return zip.compress();
				} else {
					return fromUint8Array(zip.compress());
				}
			},
			
			/**
			 * Convert Zip to Phar
			 * @static
			 * @property {string|Uint8Array|Zlib.Unzip} zip_data
			 * @returns {Phar}
			 */
			toPhar: function(zip_data) {
				if (zip_data instanceof Zlib.Unzip) {
					var zip = zip_data;
				} else if (zip_data instanceof Uint8Array) {
					var zip = new Zlib.Unzip(zip_data);
				} else {
					var zip = new Zlib.Unzip(toUint8Array(zip_data));
				}
				var phar = new PharUtils.Phar();
				
				var phar_files = [];
				var files = zip.getFilenames();
				for (var i in files) {
					phar_files.push(new PharUtils.PharFile(files[i], fromUint8Array(zip.decompress(files[i]))));
				}
				
				phar.setFiles(phar_files);
				
				return phar;
			}
		};
	} else {
		console.debug("Zlib.Zip or/and Zlib.Unzip not found, so PharZipConverter will not be loaded");
	}
	
	window.PharUtils = PharUtils;
}());
