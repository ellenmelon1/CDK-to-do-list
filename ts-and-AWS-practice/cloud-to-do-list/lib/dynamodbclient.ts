const { DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {DynamoDBDocumentClient} = require ('@aws-sdk/lib-dynamodb')

const config = { 
    region: 'eu-west-2',
 };

const dynamodbClient = new DynamoDBClient(config);
export const documentClient = DynamoDBDocumentClient.from(dynamodbClient);

