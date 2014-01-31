var app = angular.module('petashare', []);



app.factory('PetaFileManager', ['$rootScope', '$q', function($rootScope, $q)
{
  return new PetaFileManager($rootScope, $q);
}]);

app.factory('PetaPalManager', ['$rootScope', '$q', 'PetaFileManager', function($rootScope, $q, pfm)
{
	return new PetaPalManager($rootScope, $q, pfm);
}]);


app.controller('FileViewCtrl', ['$scope', '$q', 'PetaPalManager', 'PetaFileManager', function($scope, $q, PetaPalManager, PetaFileManager)
{
	console.log(PetaPalManager, PetaFileManager);
	$scope.ppm = PetaPalManager;
	$scope.pfm = PetaFileManager;
	
	
	$scope.buttonClick = function()
	{
		$scope.ppm.main();
	
	};
	
	$scope.fileUploadBlur = function(element)
	{
		$scope.pfm.addUploadedFiles(element.files);
	};	
	
	$scope.downloadFile = function()
	{
		$scope.ppm.addDownloadFile($scope.newHash, $scope.newKey);
	};
	
	$scope.deleteFile = function()
	{
		$scope.ppm.deleteFile(this.file);
	
	};
	
}]);


app.directive('petashareFileUpload', function() {
    return {
      template: 'Peerstatus: {{ppm.peerStatus}}'
    };
  });