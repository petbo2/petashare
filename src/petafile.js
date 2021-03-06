function PetaFile(filestream, db)
{
	this._fileObj = null;
	
	this._fs = null;
	
	this._db = null;
	
	this._key = null;
	
	this.chunks = [];
	
	this.chunkHashes = [];
	
	this.filename = null;
	
	this.keystone = null;
	
	this.keystoneHash = null;
	
	this.mode = null; // can be DOWNLOAD, UPLOAD or DONE
	
	this.options = {chunkSize: 1024 * 1024, salt: "LWprv6jvf/Q=", iv: "VCyAiPwIY54h2xiftUlN7Q=="};
	
	/* takes files that user has dragged onto page, or entered in file upload box */
	this.createFromUpload = function(file)
	{
		if(! file)
			return false;
		
		// generate key if not already set
		if(! this.getKey())
			this.generateKey();
		
		var self = this;
		
		this.mode = "UPLOAD";
		
		return $.Deferred(function()
		{
			var deferObj = this;
		
			self.filename = file.name;
			
			var totChunks = Math.ceil(file.size/self.options.chunkSize);
			
			var outstandingWrites = totChunks;
			
			// chunk the file into blocks
			for(var i = 0; i < totChunks; i++)
			{
				var blob = file.slice(i * self.options.chunkSize, (i+1) * self.options.chunkSize);
				
				var chunkNum = i;
					
				$.when(self.readAsBinaryString(blob)).then(self.encryptAndHashString).then(function(chunkNum)
				{
				
					return function(data)
					{
						var c = new PetaChunk({fs: self._fs, db: self._db});
						
						c.n = chunkNum;
						c.l = totChunks;
						c.content = data.crypt;
						c.type = "DATA";
						
						c.hash = data.hash;
	
						$.when(c.write()).done(function()
						{
						
							self.chunks[chunkNum] = c;
							self.chunkHashes[chunkNum] = c.hash;
							
							outstandingWrites--;
							
							if(outstandingWrites == 0)
							{
								// all chunks have been written!
								$.when(self.createKeystone()).then($.proxy(self.saveMeta, self)).done(function()
								{
									deferObj.resolve();
								
								});
							}
						}).fail(function(error)
						{
							console.log("Write failed - ", error);
							
							deferObj.reject(error);
						
						});
						
					}
				}(chunkNum));
			
			}
		});
		
	};
	
	this.createKeystone = function()
	{
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			var data = {	filename: self.filename,
							chunks: []
							};
			
			for(var i = 0, l = self.chunks.length; i < l; i++)
			{
				data.chunks.push(self.chunks[i].hash);
			}
			
			var json = JSON.stringify(data);
			
			var hashCrypt = self.encryptAndHashString(json);
			
			var c = new PetaChunk({fs: self._fs, db: self._db});
			
			c.type = "KEYSTONE";
			
			c.hash = hashCrypt.hash;
			
			c.content = hashCrypt.crypt;
			
			console.log("Hash:", c.hash, "Key:", self.getKey());
			
			$.when(c.write()).done(function()
			{
				self.keystone = c;
				
				
				deferObj.resolve();
				
			}).fail(function(error)
			{
				deferObj.reject(error);
			});
		
			return;
		
		});
	
	
	};
	
	this.loadFromKeystone = function(keystoneHash, key)
	{
		var self = this;
		
		if(! keystoneHash)
			keystoneHash = this.keystoneHash;
		
		if(! key)
			key = this.getKey();
		
		if((! keystoneHash) || (! key))
			return false; // can't load
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			// load keystone and decrypt
			self.keystone = new PetaChunk({fs: self._fs, db: self._db});
			
			self.keystone.hash = keystoneHash;
			self.keystone.type = "KEYSTONE";
			
			self.setKey(key);
			
			$.when(self.keystone.read()).done(function(data)
			{
				
				try
				{
					var json = self.decryptBinaryString(self.keystone.content);
					
					// convert to object
					var obj = JSON.parse(json);
				}
				catch (error)
				{
					console.log("Error when decoding keystone:", error.toString());
					return;	
				}
				
				
				self.filename = obj.filename;
				
				self.chunkHashes = obj.chunks;
				
				self.chunks = [];
				
				deferObj.resolve(true);
			
			}).fail(function(error)
			{
				if(error.error_code == "FILE_NOT_FOUND")
				{
					// this is fine
					deferObj.resolve(false);
				}
				else
				{
					console.log("Error when opening keystone:",error);
					deferObj.reject();
				}
				
			});
		
		});
	};
	
	
	this.writeOutFile = function()
	{
		var self = this;
		
		var totChunks = self.chunkHashes.length;
		
		// no chunks? return false
		if(totChunks == 0)
			return false;
		
		var deferObj = $.Deferred();
		
		// delete file if it already exists
		fs.root.getFile(self.filename, {create: false}, function(fileEntry)
		{
		
			fileEntry.remove(function()
			{
		    	console.log('File removed.');
		    	readAndDecryptRecursive(0); // load first chunk
		    	
		    }, function()
		    {
		    	readAndDecryptRecursive(0); // load first chunk
		    });
		
		}, function()
		{
			readAndDecryptRecursive(0); // load first chunk
		});
		
		
		// for each chunk, read contents, decrypt, write out. Do in order of chunk - this is why we have odd recursive function
		function readAndDecryptRecursive(i)
		{
			// if we have not already loaded chunk, load into memory
			if((self.chunks[i] == undefined) || (self.chunks[i].hash != self.chunkHashes[i]))
			{
				self.chunks[i] = new PetaChunk({fs: self._fs, db: self._db});
				self.chunks[i].hash = self.chunkHashes[i];
				self.chunks[i].type = "DATA";
				
				// read in chunk
				$.when(self.chunks[i].read()).then(self.decryptBinaryString).done(function(data)
				{
					
					// write out to file
					$.when(function()
					{
						return $.Deferred(function()
						{
							var writeDeferObj = this;
							
							fs.root.getFile(self.filename, {create: true}, function(fileEntry)
							{
							
								// Create a FileWriter object for our FileEntry (log.txt).
								fileEntry.createWriter(function(fileWriter)
								{
								
									fileWriter.seek(fileWriter.length); // Start write position at EOF.
									
									// Create a new Blob and write it to log.txt.
									var blob = new Blob([data]);
									
									fileWriter.write(blob);
									
									writeDeferObj.resolve();
								
								}, function(error)
								{
									writeDeferObj.reject(error);
								});
								
							}, function(error)
							{
								writeDeferObj.reject(error);
							});
						});
					}()).done(function()
					{
					
					
						console.log(i, "written");
						
						if((i+1) < totChunks)
						{
							i++;
							readAndDecryptRecursive(i);
						}
						else
						{
							deferObj.resolve();
						}
					});
						
				
				}).fail(function(error)
				{
					console.log("Error when reading chunk", error);
					deferObj.reject();
				});
			
			}
		}
		
	
	
	
	};
	
	// reads a file or a blob, returns a promise
	this.readAsBinaryString = function(blob)
	{
		var self = this;
		
		return $.Deferred(function()
		{
			var reader = new FileReader();
			
			var deferObj = this;
			
			reader.onloadend = function ()
			{
				deferObj.resolve(reader.result);
				
			}
					
			reader.readAsBinaryString(blob);
		});
	
	};
	
	this.encryptAndHashString = $.proxy(function(input)
	{
		var c = this.encryptBinaryString(input);
		
		return {crypt: c,
				hash: this.getHexStringHash(c) };
	
	}, this);
	
	this.encryptBinaryString = function(input)
	{
		return sjcl.encrypt(this.getKey(), input, {salt: this.options.salt, iv: this.options.iv});
	
	};
	
	this.decryptBinaryString = $.proxy(function(input)
	{
		return sjcl.json.decrypt(this.getKey(), input);
	
	}, this);
	
	
	this.getHexStringHash = function(input)
	{
		return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(input));
	
	};
	
	
	// sets random key - TODO: generate random key
	this.generateKey = function()
	{
		return this.setKey("abcdefghijklmnopqrstuvwxyz");
	
	};

	this.errorHandler = function(event)
	{
		console.log(this, event);
	}

	this.setKey = function(key)
	{
		this._key = key;
		
		return this;
	};
	
	this.getKey = function()
	{
		return this._key;
	};
	
	this.saveMeta = function()
	{
		if((! this._key) || ((! this.keystone) && (! this.keystoneHash)))
		{
			console.log("Not enough information to save file");
			return;
		}
		
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
		
			if(! self.keystoneHash)
				self.keystoneHash = self.keystone.hash;
			
			
			self._db.put({name: 'files', keyPath: 'keystoneHash'}, {keystoneHash: self.keystoneHash, key: self._key, filename: self.filename, mode: self.mode}).done(function(res)
			{
				deferObj.resolve();
			
			}).fail(function(error)
			{
				deferObj.reject(error);
			
			});
		
		});
	
	};
	
	
	this.loadFromMeta = function()
	{
		
		if(! this.keystoneHash)
		{
			console.log("Not enough information to load file");
			return;
		}
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			
			self._db.get('files', self.keystoneHash).done(function(res)
			{
				self.setKey(res.key);
				self.filename = res.filename;
				self.mode = res.mode;
				
				$.when(self.loadFromKeystone(self.keystoneHash, self.getKey())).done(function(res)
				{
					deferObj.resolve();
				});
			
			}).fail(function(error)
			{
				deferObj.reject(error);
			
			});
		
		});
	
	};
	
	this.deleteMeta = function()
	{
		if(! this.keystoneHash)
		{
			console.log("Not enough information to delete file");
			return;
		}
		
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			
			self._db.remove('files', self.keystoneHash).done(function(res)
			{
				deferObj.resolve();
			
			}).fail(function(error)
			{
				deferObj.reject(error);
			
			});
		
		});
		
	};
	
	this.downloadFile = function(keystoneHash, key)
	{
		this.keystoneHash = keystoneHash;
		this.setKey(key);
		
		this.mode = "DOWNLOAD";
		
		// save for later
		this.saveMeta();
	};
	
	// check to see what chunks we still need to download - make sure keystone is read first (if it exists)
	// returns true if everything is downloaded
	this.getOutstandingChunks = function(availableChunks)
	{
		var self = this;

		/* 3 possibilities:
		1) Haven't yet downloaded keystone, so only 1 chunk outstanding
		2) Have got keystone, but don't have all the other chunks done
		3) Have got everything
		*/
		
		if($.inArray(self.keystoneHash, availableChunks) == -1)
		{
			// need to download keystone first
			return [self.keystoneHash];
		}
		else if((self.keystone) && (self.chunkHashes.length > 0))
		{
			var needed = [];
			for(var i = 0, l = self.chunkHashes.length; i < l; i++)
			{
				if($.inArray(self.chunkHashes[i], availableChunks) == -1)
					needed.push(self.chunkHashes[i]);
			}
			
			if(needed.length == 0)
			{
				// everything downloaded!
				self.mode = "DONE";
				return true;
			}
			else
			{
				return needed;	
			}
		}
		
		// should never hit here!
		return false;
	
	};
	
	this.init = function(filestream, db)
	{
		if(filestream)
			this._fs = filestream;
		
		
		this._db = db;
			
		
	};
	
	
	
	
	this.init(filestream, db);
}