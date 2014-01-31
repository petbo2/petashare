function PetaChunk(options)
{
	
	this._options = {fs: null, db: null};
	
	this.content = null; // content should already be encrypted
	
	this.n = null; // chunk number (0-based)
	
	this.l = null; // total number of chunks
	
	this.hash = null;
	
	this.type = null;

		
	this.init = function(options)
	{
		var self = this;
		
		// merge options
		if(options)
			$.extend(this._options, options);
		
		// TODO: decide whether to use filesystem or indexDB
			
		return this;
		
	};
	
	this.write = function()
	{
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			function errorHandler(error)
			{
				deferObj.reject(error);
			
			}
			
			console.log(self._options);
			
			if(self._options.fs)
			{
			
				self._options.fs.root.getFile(self.hash, {create: true}, function(fileEntry)
				{
				
					// Create a FileWriter object for our FileEntry (log.txt).
					fileEntry.createWriter(function(fileWriter)
					{
					
						fileWriter.onwriteend = function(e)
						{
							console.log('Write completed.');
							
							deferObj.resolve();
							
						};
						
						console.log("Begining write");
						
						fileWriter.onerror = errorHandler;
				
						// Create a new Blob and write it to file.
						var blob = new Blob([self.content], {type: "text/plain"});
						
						fileWriter.write(blob);
					
					}, errorHandler);
					
				}, errorHandler);
			}
			else if (self._options.db)
			{
				// save to DB
				console.log("Begining DB write");
				
				console.log({message: self.content});
				
				
				self._options.db.put({name: 'chunks', keyPath: 'hash'}, {content: self.content, hash: self.hash}).done(function(res)
				{
					console.log('Write completed.');
					
					deferObj.resolve();
					
				}).fail(function(error)
				{
				
					console.log('Write failed.', error);
					
					deferObj.reject(error);
				
				});
				
				
				
			}
			
		});	
	
	};
	
	this.read = function()
	{
		
		// load chunk, or return false if doesn't exist
		var self = this;
		
		
		return $.Deferred(function()
		{
			var deferObj = this;
			
			if(self._options.fs)
			{
			
				self._options.fs.root.getFile(self.hash, {}, function(fileEntry)
				{
				
					// Get a File object representing the file,
					// then use FileReader to read its contents.
					fileEntry.file(function(file)
					{
						var reader = new FileReader();
						
						reader.onloadend = function(e)
						{
							self.content = reader.result;
							deferObj.resolve(self.content);
						};
						
						reader.readAsText(file);
					
					}, function()
					{
						deferObj.reject({"error_code" : "FILE_NOT_READABLE"});
							
						return;
					});
				
				}, function()
				{
					deferObj.reject({"error_code" : "FILE_NOT_FOUND"});
						
					return;
				});
			
			
			}
			else if (self._options.db)
			{
				self._options.db.get("chunks", self.hash).done(function(record)
				{
					if(record == undefined)
					{
						deferObj.reject({"error_code" : "FILE_NOT_FOUND"});
							
						return;
					}
					
					self.content = record.content;
					
					deferObj.resolve(self.content);
				
				}).fail(function(error)
				{
					deferObj.reject(error);
						
					return;
				
				});
					
			}
		});
		
	};
	
	
	this.parseChunk = function(rawChunk)
	{

		try
		{
			var obj = $.parseJSON(rawChunk);
			
			if((obj.payload == undefined) || (obj.n == undefined) || (obj.l == undefined) || (obj.type == undefined))
				return false; // missing bits
			
			obj.n = parseInt(obj.n, 10);
			obj.l = parseInt(obj.n, 10);
			
			obj.type = (obj.type == "keystone") ? "keystone" : "data";
			
			return obj;
			 
				
		}
		catch(error)
		{
			return false;
		}
		
	};

	this.init(options);
}