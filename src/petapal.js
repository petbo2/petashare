function PetaPal(manager, id)
{
	this._id = null;
	
	this._conn = null;
	
	this._options = {reliable: true};
	
	this._manager = null;
	
	this._wantedChunks = [];
	
	this.status = "CLOSED";
	
	this.init = function(manager, id)
	{
		this._manager = manager; // not optional!
		
		if(id)
		{
			this._id = id;
			
			this._conn = peer.connect(id, this._options);
			
			this.setupEventListeners();
		}
		
	};
	
	this.setupEventListeners = function()
	{
		this._conn.on('error', this.handleError);
		this._conn.on('open', this.handleConnect);
		this._conn.on('close', this.handleClose);
		this._conn.on('data', this.handleData);
		
		return this;
	};
	
	/* if someone has connected to us, we need to create a matching petapal pointing at them */
	this.assumeIncomingConnection = function(conn)
	{
		this._id = conn.peer;
		this._conn = conn;
		
		this.status = "OPEN";
		
		this.setupEventListeners();
	};
	
	this.handleConnect = $.proxy(function(event)
	{
		/* called the first time a connection is opened to the client */
		this.status = "OPEN";
	
	}, this);
	
	this.handleError = $.proxy(function(error)
	{
		this.status = "CLOSED";
	
	}, this);
	
	this.handleClose = $.proxy(function()
	{
		this.status = "CLOSED";
	
	}, this);
	
	
	this.handleData = $.proxy(function(data)
	{
		try
		{
			// check valid JSON
			var obj = JSON.parse(data);
		}
		catch (error)
		{
			console.log("Not valid JSON", error, data);
			return;
		}
		
		if(! obj.command)
		{
			console.log("Missing command", obj);
			return;
		}
		
		if((obj.command != "I_WANT")&&(obj.command != "STORE_THIS"))
		{
			console.log("Command not valid:", obj.command);
			return;
		}
		
		
		
		if(obj.command == "I_WANT")
		{
			if(! $.isArray(obj.hashes))
			{
				console.log("Hash array not specified for I_WANT command", obj);
				return;
			}
			
			// add hashes to list
			this.addWantedChunks(obj.hashes);
			
			return;
		
		}
		else
		{
			// STORE_THIS
			if(! obj.chunk)
			{
				console.log("Chunk not specified for STORE_THIS command", obj);
				return;
			}
			
			console.log("Incoming STORE_THIS", obj.chunk.length);
			
			this.storeChunk(obj.chunk);
			
			return;
			
		}
		
	
	}, this);
	
	
	this.addWantedChunks = function(hashArray)
	{
		for(var i = 0, l = hashArray.length; i < l; i++)
		{
			if($.inArray(hashArray[i], this._wantedChunks) == -1)
			{
				// not already in array
				this._wantedChunks.push(hashArray[i]);
			}
		
		}
		
		// tell manager that these chunks are wanted
		this._manager.addWantedChunksFromPal(this._id, hashArray);
	
	};
	
	
	this.storeChunk = function(chunkData)
	{
		// TODO: check chunk is valid format
		
		this._manager.storeChunkFromPal(this._id, chunkData);
		
		return;
	};
	
	this.sendChunk = function(chunkData)
	{
		// TODO: may need to JSON.stringify(JSON.parse(Z))
		var c = '{"command":"STORE_THIS", "chunk":"' + chunkData.replace(/"/g, "\\\"") + '"}';
		
		// add to send queue
		this._conn.send(c);
		
	
	};
	
	

	this.init(manager, id);
}