/*
window.requestFileSystem  = window.requestFileSystem  || window.webkitRequestFileSystem ;

var pfm = new PetaFileManager();
var ppm = new PetaPalManager({}, pfm);


$(window).ready(function()
{
	$("#inpFile").on("change", function(event)
	{
		 pfm.addUploadedFiles(this.files);
		 
		 return;
		 
	
	});
	
	
	$("#inpSend").click(function(event)
	{
		event.preventDefault();
		
		ppm.main();
		
	
	});
	
	
	
	
});

*/