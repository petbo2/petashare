function PetaFileManager($rootScope, $q)
{
	
	
	this.useFs = false;
	
	this.useDB = false;
	
	this.files = [];
	
	this._fs = null;
	
	this._db = null;
	
	this.chunks = [];
	
	this._ownWantedChunks = [];
	
		
	this.init = function($rootScope, $q)
	{
		var self = this;
		
		
		if(false /*navigator.webkitPersistentStorage != undefined*/)
		{
			
			navigator.webkitPersistentStorage.requestQuota(1024*1024*1024, function(grantedBytes)
			{
				window.requestFileSystem(PERSISTENT, grantedBytes, onInitFs, errorHandler);
			},
			function(e)
			{
				console.log('Error', e);
			});
			
			
			function onInitFs(_fs)
			{
				self.useFs = true;
				
				self._fs = _fs;
				
				self.getChunkList();
				
			}
			
			function errorHandler(event)
			{
				console.log(this, event);
				
				self.useFs = false;
			}
		}
		else
		{
			
			this._db =  new ydn.db.Storage('petashare');
			
			this._db.onReady(function(e)
			{
				self.useDB = true;
				
				$.when(self.getChunkList(), self.getAllFiles()).then($.proxy(self.getOwnWantedChunks,self)).done(function()
				{
					$(window).trigger("petashare.load");
					
					$rootScope.$apply();
				});
			
			});
		}
		
	};
	
	this.addChunk = function(chunkData)
	{
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			var c = new PetaChunk({fs: self._fs, db: self._db});
			
			c.content = chunkData;
			
			// hash
			c.hash = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(c.content));
			
			$.when(c.write()).then($.proxy(self.getChunkList, self)).done(function()
			{
				deferObj.resolve(c.hash);
				c = null;
			
			}).fail(function(error)
			{
				deferObj.reject(error);
				c = null;
			
			});
		});
	};
	
	
	this.getChunkList = function()
	{
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			if(self._fs)
			{
			
				var dirReader = self._fs.root.createReader();
				var entries = [];
				
				// Call the reader.readEntries() until no more results are returned.
				var readEntries = function()
				{
					dirReader.readEntries (function(results)
					{
						if (!results.length)
						{
							entries = $.map(entries, function(n, i)
							{
								return n.name;
							
							});
							
							deferObj.resolve(entries);
							self.chunks = entries;
							return;
						}
						else
						{
							entries = entries.concat(toArray(results));
							readEntries();
						}
						
					}, function(error)
					{
						deferObj.reject(error);
						return;
					
					});
				};
				
				function toArray(list)
				{
				  return Array.prototype.slice.call(list || [], 0);
				}
				
				readEntries(); // Start reading dirs.
			
	
			}
			else if (self._db)
			{
				self._db.keys('chunks').done(function(records)
				{
					deferObj.resolve(records);
					self.chunks = records;
					
					return;
				});	
			}
		
		});
	};
	
	this.getRandomChunk = function()
	{
		// TODO: be slightly more clever about what file to choose
		var self = this;
		
		if(self.chunks.length == 0)
			return false;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			var num = Math.floor(Math.random() * (self.chunks.length));
			
			var c = new PetaChunk({fs: self._fs, db: self._db});
			
			c.hash = self.chunks[num];
			
			$.when(c.read()).done(function()
			{
				deferObj.resolve(c);
			
			}).fail(function(error)
			{
				deferObj.reject(error);
			
			});
			
			
		});
	
	};
	
	this.addUploadedFiles = function(fileList)
	{		
		var self = this;
		
		var outStandingFiles = fileList.length;
		
		for(var i = 0, l = fileList.length; i < l; i++)
		{
			
			var f = new PetaFile(this._fs, this._db);
			
			$.when(f.createFromUpload(fileList[i])).done(function()
			{
				outStandingFiles--;
				
				if(outStandingFiles == 0)
				{
					$.when(self.getChunkList(), self.getAllFiles()).done(function()
					{
						$rootScope.$apply();
					
					});
				}
			
			});
			
			this.files.push(f);
			
		}
	
		$rootScope.$apply();
	};
	
	
	this.addWantedFile = function(hash, key)
	{
		var self = this;
		var f = new PetaFile(this._fs, this._db);
		
		f.keystoneHash = hash;
		f.setKey(key);
		
		// can we load from keystone?
		return $q.when(f.loadFromKeystone()).then($.proxy(f.saveMeta,f), $.proxy(f.saveMeta,f)).then(function()
		{
			self.files.push(f);
		});		
	
	};
	
	
	this.getOwnWantedChunks = function()
	{
		var self = this;
		
		var deferObj = $q.defer();
		
		self._ownWantedChunks = [];
		
		if(self.files.length == 0)
		{
			deferObj.resolve([]);
			return [];
		}
		
		$.when(self.getChunkList()).done(function(availChunks)
		{
			// now see what chunks we want for each file
			for(var i = 0, l = self.files.length; i < l; i++)
			{
				if(self.files[i].mode != "UPLOAD")
				{
					var c = self.files[i].getOutstandingChunks(availChunks);
					
					if(c === false)
					{	
						console.log("Error when getting chunks:", self.files[i], availChunks);
					}
					
					if($.isArray(c))
					{
						$.merge(self._ownWantedChunks, c);
					}
					
				}
				
			}
			
			deferObj.resolve(self._ownWantedChunks);
			
			return;
			
		});
		
		
		return deferObj.promise;
	
	};
	
	// this connects to DB, and fetches all ongoing files
	this.getAllFiles = function()
	{
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
		
			self._db.values('files').done(function(items)
			{
				self.files = [];
				
				if($.isArray(items))
				{
					var todo = items.length;
					
					for(var i = 0, l = items.length; i < l; i++)
					{
						var f = new PetaFile(self._fs, self._db);
						f.keystoneHash = items[i].keystoneHash;
						f.setKey(items[i].key);
						self.files.push(f);
						
						$.when(f.loadFromKeystone()).done(function()
						{
							todo--;
							
							if(todo < 1)
							{
								deferObj.resolve(self.files);
							}
						
						});
						
					}
				}
				else
				{
				
					deferObj.resolve(self.files);
				}
				
				
			}).fail(function(error)
			{
				deferObj.reject(error);
			
			});
			
		});
	
	};

	this.init($rootScope, $q);
}

