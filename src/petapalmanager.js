var peer = new Peer(null, {host: '192.168.0.16', port: 9000, debug: false});

function PetaPalManager(options, fileManager)
{
	this._petaPals = [];
	
	this._newPetaPals = [];
	
	this._options = {maxPetaPals: 3, apiBase: "http://192.168.0.16:3000", loopInterval: 1};
	
	this.peerStatus = "CLOSED";
	
	this._wantedChunks = [];
	
	this._userWantedChunks = [];
	
	this._fileManager = null;
		
	this.loadPetaPalsFromServer = function()
	{
		var self = this;
		
		return $.Deferred(function()
		{
			var deferObj = this;
		
			
			$.getJSON(self._options.apiBase + '/users', function(data)
			{
				if((! data)||(data.length == 0))
				{
					deferObj.resolve(false);
					return;
				}
				
				
				if(data.length > 0)
					$.merge(self._newPetaPals, data);
				
				deferObj.resolve(data);
				return;
			});
			
		});	
	
	};
	
	/* will ensure all PetaPal slots are filled (if possible), culling broken/closed ones */
	this.fillPetaPalConns = function()
	{
		var self = this;
		
		self.cullClosedPetaPals();
		
		// if max connections already filled, then give up
		if(self._petaPals.length >= self._options.maxPetaPals)
			return this;
		
		// we have connections to fill!
		// while current connections less than max, and more petapals in queue for connecting
		while((self._petaPals.length < self._options.maxPetaPals) && (self._newPetaPals.length > 0))
		{
			// connect to petaPal
			self._petaPals.push(new PetaPal(self, self._newPetaPals.shift()));
		}
		
		
	
	};
	
	this.cullClosedPetaPals = function()
	{
		var self = this;
		var temp = [];
		
		$.each(self._petaPals, function()
		{
			// only keep ones that are not already closed
			if(this.status != "CLOSED")
			{
				temp.push(this);
			}
		
		});
		
		self._petaPals = temp;
		
		return self;
	};
	
	this.addWantedChunksFromPal = function(palId, hashArray)
	{
		for(var i = 0, l = hashArray.length; i < l; i++)
		{
			var index = this.chunkIndexOf(hashArray[i]);
			
			if(index > -1)
			{
				// check pal not already requested this chunk
				if($.inArray(palId, this._wantedChunks[index].wantedBy) == -1)
				{
					this._wantedChunks[index].wantedBy.push(palId);
				
				}
			}
			else
			{
				this._wantedChunks.push({   hash: hashArray[i],
											priority: 0,
											userPriority: 0,
											wantedBy: [palId]});
			}
		
		}
		
	
	};
	
	this.storeChunkFromPal = function(palId, chunkData)
	{
		this._fileManager.addChunk(chunkData);
	
	
	};
	
	this.chunkIndexOf = function(hash)
	{
		for(var i = 0, l = this._wantedChunks.length; i < l; i++)
		{
			if(this._wantedChunks.hash == hash)
				return i;
		}
		
		return -1;
		
	};
	
	this.main = function()
	{
		//console.log("Doing main", this);
		var self = this;
		
		// get rid of broken connections
		this.cullClosedPetaPals();
		
		// for each pal, send file or do something
		for(var i = 0, l = this._petaPals.length; i < l; i++)
		{
			// send data - either a wanted chunked, or a random chunk TODO
			$.when(self._fileManager.getRandomChunk()).done(function(i)
			{
				return function(chunk)
				{
					console.log(chunk);
					
					self.sendChunkToPal(chunk, self._petaPals[i]);
				
				}
			}(i));
		
		
		
		}
		
		
		
		/* fill petPals */
		this.fillPetaPalConns();
	
	};
	
	this.sendChunkToPal = function(chunk, pal)
	{
	
		console.log("Sending ",chunk.hash, " to ", pal._id);
		
		pal.sendChunk(chunk.content);
	
	
	};
	
	this.addWantedFile = function(hash, code)
	{
		
	
	};
	
	this.init = function(options, fileManager)
	{
		var self = this;
		
		// merge options
		$.extend(this._options, options);
		
		// load pals
		$.when(this.loadPetaPalsFromServer()).done(function(data)
		{
			console.log(data, "New pals found");
			
			self.fillPetaPalConns();
		
		});
		
		this._fileManager = fileManager;
		
		// set up peer handlers
		peer.on('open', function(id)
		{
			self.peerStatus = "OPEN";
		});
		
		peer.on('connection', function(conn)
		{
			console.log("Incoming connection");
			
			// if too many connections, try culling some
			if(self._petaPals.length >= self._options.maxPetaPals)
				self.cullClosedPetaPals();
			
			// if max connections already filled, then reject connection
			if(self._petaPals.length >= self._options.maxPetaPals)
			{
				// we can try and connect back later
				self._newPetaPals.push(conn.peer);
				conn.close();
				return this;
			}
			
			// create PetaPal to handle this
			var p = new PetaPal(self, false);
			p.assumeIncomingConnection(conn);
			
			self._petaPals.push(p);
			
		});
		
		/*
		this._mainLoopIntervalId = window.setInterval(function()
		{
			self.main();
		}, this._options.loopInterval * 1000);
		
		*/
	};
	

	this.init(options, fileManager);
}