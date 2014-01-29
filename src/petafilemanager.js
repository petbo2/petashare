function PetaFileManager(options)
{
	
	this._options = {};
	
	this.useFs = false;
	
	this.useDB = false;
	
	this.files = [];
	
	this._fs = null;
	
	this._db = null;
	
	this.chunks = [];
	
		
	this.init = function(options)
	{
		var self = this;
		
		// merge options
		$.extend(this._options, options);
		
		// TODO: check for FireFox
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
				
				/*
				var f = new PetaFile(fs);
				
				//"eddc70aa86c7b2ccaaf1fd1c61abe74f94887db8aed586d378036642c99efd01", 5ec09e2113f36df0d525f5520c51e82808b74def52ac8c83fe158e6e818bedc8		
				$.when(f.loadFromKeystone("eddc70aa86c7b2ccaaf1fd1c61abe74f94887db8aed586d378036642c99efd01","abcdefghijklmnopqrstuvwxyz")).then($.proxy(f.writeOutFile, f)).done(function()
				{
					console.log(f);
					
					console.log("Write out successful!");
				
				});
				
				*/	
			}
			
			function errorHandler(event)
			{
				console.log(this, event);
				
				self.useFs = false;
			}
		}
		else
		{
			// TODO: add database code
			
			this._db =  new ydn.db.Storage('petashare');
			
			this._db.onReady(function(e)
			{
				self.useDB = true;
				
				self.getChunkList();
			
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
							
							deferObj.resolve(entries.sort());
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
					self.getChunkList();
				}
			
			});
			
			this.files.push(f);
		}
	
	
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
				if($.isArray(items))
					self.files = items;
				else
					self.files = [];
				
				deferObj.resolve(self.files);
				
			}).fail(function(error)
			{
				deferObj.reject(error);
			
			});
			
		});
	
	};

	this.init(options);
}