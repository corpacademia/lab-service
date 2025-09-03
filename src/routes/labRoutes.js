const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createLab,
    getAllLab,
    getLabOnId,
    assignLab,
    getAssignLabOnId,
    getInstanceOnParameters,
    getInstanceDetailsForPricing,
    updateLabsOnConfig,
    awsConfigure,
    getAwsInstanceDetails,
    getAwsInstanceDetailsOfUsers,
    updateAwsInstanceDetailsOfUsers,
    updateAwsLabInstanceDetails,
    labBatch,
    getLabBatchAssessment,
    getSoftwareDetails,
    getLabsConfigured,
    getLabCatalogues,
    checkIsStarted,
    createNewCatalogue,
    getOperatingSystemsFromDatabase,
    getAssignLabOnLabId,
    UpdateSingleVmLabStatus,
    getCount,
    getCloudSliceOrgLabs,
    createSingleVmDatacenterLab,
    getDatacenterLabOnAdminId,
    getDatacenterLabCredentials,
    updateSingleVmDatacenterLab,
    assignSingleVmDatacenterLab,
    assignSingleVmDatacenterLabCredentialsToOrg,
    editSingleVmDatacenterLabCredentials,
    deleteSingleVmDatacenterLab,
    updateSingleVmDatacenterCredsDisable,
    getOrgAssignedSingleVMDatacenterLab,
    getDatacenterLabOnLabId,
    assignSingleVMDatacenterLabToUsers,
    getUserAssignedSingleVMDatacenterLabs,
    getUserAssignedSingleVMDatacenterCredsToUser,
    connectDatacenterVM,
    updateSingleVMDatacenterUserCredRunningState,
    deleteSingleVMDatacenterLabOfUser,
    deleteSingleVMDatacenterLabFromOrg,
    updateSingleVMDatacenterLabContent,
    getSingleVmDatacenterLabs,
    updateUserLabTimingsOfSingleVMDatacenter,
    updateSingleVMAws,
    updateUserLabTimingsOfAwsSingleVMDatacenter,
    getAllLabCatalogues,
    deleteCatalogue,
    updateCatalogueDetails,
    getUserPurchasedSinglvmLabs,
    updateSingleVMAwsLab
} = require('../controllers/labController');

const {
  createCartItem,
  getCartItemsByUserId,
  deleteCartItem,
  deleteCartItemsOnUserId,
  updateCartItem,
  stripeCheckout,
  getTransactionDetails,
  exportTransactions,
  userTransactions
} = require('../controllers/labCartController');

const {
  getNotificationsOfUser,
  markAsRead,
  markAllAsRead,
  deleteNotifications,
  setUserNotificationSettings,
  getUserNotificationSettings
} = require('../controllers/notificationController');

const router = express.Router();

const uploadDir = path.join(__dirname, '../public/uploads/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up multer storage options
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Use the correct folder path
  },
  filename: function (req, file, cb) {
    cb(null, `${file.originalname}}`); // Unique file names
  },
});

// Create the upload middleware using multer
const upload = multer({ storage });

router.post('/labconfig',createLab);
router.post('/createSingleVmDatacenterLab',createSingleVmDatacenterLab);
router.get('/getCatalogues',getAllLab);
router.post('/getLabOnId',getLabOnId); 
router.post('/assignlab',assignLab);
router.post('/getAssignedLabs',getAssignLabOnId);
router.post('/getInstances',getInstanceOnParameters);
router.post('/getInstanceDetails',getInstanceDetailsForPricing);
router.post('/getLabsConfigured',getLabsConfigured);
router.post('/amiInformation',awsConfigure);
router.post('/awsCreateInstanceDetails',getAwsInstanceDetails);
router.post('/awsInstanceOfUsers',getAwsInstanceDetailsOfUsers);
router.post('/updateawsInstanceOfUsers',updateAwsInstanceDetailsOfUsers);
router.post('/updateawsInstance',updateAwsLabInstanceDetails);
router.post('/batchAssignment',labBatch);
router.post('/getAssessments',getLabBatchAssessment);
router.get('/getSoftwareDetails',getSoftwareDetails);
// router.post('/getLabsConfigured',getLabsConfigured);
router.get('/getPublicCatalogues',getLabCatalogues);
router.post('/updateConfigOfLabs',updateLabsOnConfig);
router.post('/checkisstarted',checkIsStarted);
router.post('/createCatalogue',createNewCatalogue);
router.post('/checkvmcreated',awsConfigure);
router.get('/getOs',getOperatingSystemsFromDatabase);
router.post('/getAssignLabOnId',getAssignLabOnLabId);
router.post('/updateSingleVmStatus',UpdateSingleVmLabStatus);
router.post('/getCountoflabs/:userId',getCount);
router.get('/getCloudSliceLabsOfOrg/:orgId',getCloudSliceOrgLabs);
router.post('/getDatacenterLabOnAdminId', getDatacenterLabOnAdminId);
router.post('/getDatacenterLabCreds',getDatacenterLabCredentials);
router.post('/updatesinglevmdatacenter',updateSingleVmDatacenterLab);
router.post('/singleVMDatacenterLabOrgAssignment', assignSingleVmDatacenterLab)
router.post('/assignLabCredsToOrg',assignSingleVmDatacenterLabCredentialsToOrg)
router.post('/editSingleVmDatacenterCreds',editSingleVmDatacenterLabCredentials);
router.delete('/deleteSingleVMDatacenterLab/:labId',deleteSingleVmDatacenterLab);
router.post('/updateSingleVmDatacenterLabCreds',updateSingleVmDatacenterCredsDisable);
router.post('/getOrgAssignedSingleVMDatacenterLab',getOrgAssignedSingleVMDatacenterLab);
router.post("/getSingleVmDatacenterLabOnId",getDatacenterLabOnLabId);
router.post("/assignSingleVmDatacenterLabToUser",assignSingleVMDatacenterLabToUsers);
router.post('/getUserAssignedSingleVmDatacenterLabs/:userId',getUserAssignedSingleVMDatacenterLabs)
router.post('/getUserAssignedSingleVMDatacenterCredsToUser',getUserAssignedSingleVMDatacenterCredsToUser);
router.post('/connectToDatacenterVm',connectDatacenterVM);
router.post('/updateSingleVmDatacenterUserAssignment',updateSingleVMDatacenterUserCredRunningState);
router.post('/deleteSingleVmDatacenterUserAssignment',deleteSingleVMDatacenterLabOfUser);
router.post('/deleteAssignedSingleVMDatacenterLab',deleteSingleVMDatacenterLabFromOrg);
router.post('/updateSingleVmDatacenterLab',upload.fields([
  { name: 'labGuide', maxCount: 5 },
  { name: 'userGuide', maxCount: 5 }
]),updateSingleVMDatacenterLabContent );
router.post('/updateSingleVMAwsLab',upload.fields([
  { name: 'labGuide', maxCount: 5 },
  { name: 'userGuide', maxCount: 5 }
]),updateSingleVMAwsLab );
router.post('/getSingleVmDatacenterLabs',getSingleVmDatacenterLabs);
router.post('/updateSingleVMDatacenterLabTime',updateUserLabTimingsOfSingleVMDatacenter);
router.post('/updateCatalogueDetails',updateSingleVMAws);
router.post('/updateUserLabTimingsOfAwsSingleVMDatacenter',updateUserLabTimingsOfAwsSingleVMDatacenter);
router.post('/getAllLabCatalogues',getAllLabCatalogues);
router.delete('/deleteLabCatalogue/:catalogueId',deleteCatalogue)
router.post('/updateLabCatalogue',updateCatalogueDetails);
router.post('/addToCart', createCartItem);
router.get('/getCartItems/:userId', getCartItemsByUserId);
router.delete('/removeFromCart/:cartItemId', deleteCartItem);
router.delete('/clearCart/:userId', deleteCartItemsOnUserId);
router.put('/updateCartItem/:cartItemId', updateCartItem);
router.post('/create-checkout-session', stripeCheckout);
router.post('/getSingleVMUserPurchsedLabs',getUserPurchasedSinglvmLabs)
router.get('/notifications/:userId',getNotificationsOfUser);
router.patch('/notifications/:notificationId/read',markAsRead);
router.patch('/notifications/:userId/read-all',markAllAsRead);
router.delete('/notifications/:notificationId',deleteNotifications);
router.post('/organization/:orgId/transactions', getTransactionDetails);
router.get('/organization/:orgId/export',exportTransactions);
router.get('/user/:userId/transactions', userTransactions);
router.post('/setNotificationSettings/:userId',setUserNotificationSettings);
router.get('/notifications/preferences/:userId',getUserNotificationSettings);


module.exports = router;