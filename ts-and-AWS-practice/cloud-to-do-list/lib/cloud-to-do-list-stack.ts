import { Stack, StackProps, aws_s3, aws_s3_deployment, aws_cognito, aws_dynamodb, aws_iam, aws_lambda_nodejs, aws_cloudfront, aws_cloudfront_origins} from 'aws-cdk-lib';
import * as appsync from '@aws-cdk/aws-appsync-alpha'
import { Construct } from 'constructs';
import { OriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront';


export class CloudToDoListStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ToDoListBucket = new aws_s3.Bucket(this, 'ToDoListBucket', {
      versioned: true,
      blockPublicAccess: new aws_s3.BlockPublicAccess({ blockPublicPolicy: false, blockPublicAcls:false,ignorePublicAcls:false, restrictPublicBuckets:false }),
      publicReadAccess:true
    });

    new aws_s3_deployment.BucketDeployment(this,'FrontEndAssetDeployment',{
      sources:[aws_s3_deployment.Source.asset('./build')],
      destinationBucket: ToDoListBucket,
    })

    const accessIdentity = new OriginAccessIdentity(this,'accessIdentity');

    const redirectError: aws_cloudfront.ErrorResponse = {
      httpStatus: 404,
      responseHttpStatus: 200,
      responsePagePath: '/index.html'
    }

    const accessDeniedErrorRedirect: aws_cloudfront.ErrorResponse = {
      httpStatus: 403,
      responseHttpStatus: 200,
      responsePagePath: '/index.html'
    }

    new aws_cloudfront.Distribution(this, 'myDist', {
      defaultBehavior: 
      {origin: new aws_cloudfront_origins.S3Origin(ToDoListBucket, {originAccessIdentity: accessIdentity}),
      allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
      originRequestPolicy: aws_cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      responseHeadersPolicy: aws_cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS},
      errorResponses:[redirectError, accessDeniedErrorRedirect]
  })


    const corsRule:aws_s3.CorsRule={
      allowedHeaders:['*'],
      allowedMethods:[aws_s3.HttpMethods.GET, aws_s3.HttpMethods.HEAD, aws_s3.HttpMethods.PUT, aws_s3.HttpMethods.POST, aws_s3.HttpMethods.DELETE],
      allowedOrigins:['http://cloudtodoliststack-todolistbucket24986b86-1xu8ks60p0cqq.s3-website.eu-west-2.amazonaws.com', 'http://localhost:3000', 'https://d1m3jgcuw5fz76.cloudfront.net'],
      exposedHeaders:['x-amz-server-side-encryption','x-amz-request-id','x-amz-id-2','ETag'],
      maxAge:3000
    }

    const UserUploadsBucket = new aws_s3.Bucket(this, 'UserUploadsBucket', {
      versioned: true,
      blockPublicAccess: new aws_s3.BlockPublicAccess({ blockPublicPolicy: false, blockPublicAcls:false,ignorePublicAcls:false, restrictPublicBuckets:false }),
      publicReadAccess:true,
      cors:[corsRule]
    });

    const ToDoListUserPool = new aws_cognito.UserPool(this,'ToDoListUserPool',{
      userPoolName:'ToDoListUserPool',
      selfSignUpEnabled:true,
      userVerification:{
        emailSubject: 'Verify your email for our awesome app!',
        emailBody: 'Thanks for signing up to our awesome app! Your verification code is {####}',
        emailStyle: aws_cognito.VerificationEmailStyle.CODE,
      },
      signInAliases: {
        username: true,
      },
      autoVerify:{
        email:true
      },
      passwordPolicy:{
        minLength:6
      }
    });

    const client=ToDoListUserPool.addClient('to-do-list-app-client',{
      authFlows:{
        userPassword:true,
        userSrp:true
      },
      preventUserExistenceErrors: true,
    })

    const ToDoListIdentityPool=new aws_cognito.CfnIdentityPool(this,'ToDoListIdentityPool',{
      allowUnauthenticatedIdentities:false,
      cognitoIdentityProviders:[{
        clientId:client.userPoolClientId,
        providerName:ToDoListUserPool.userPoolProviderName
      }]
    })

    const authenticatedRole=new aws_iam.Role(this,'authenticated-role',{
      description:'default role for authenticated users',
      assumedBy: new aws_iam.FederatedPrincipal('cognito-identity.amazonaws.com',
      {
        StringEquals: {
          'cognito-identity.amazonaws.com:aud': ToDoListIdentityPool.ref,
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'authenticated',
        },
      },
      'sts:AssumeRoleWithWebIdentity',),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    })

    const unauthenticatedRole = new aws_iam.Role(this,'unathenticated-role',{
      description:'default role for unauthenticated users',
      assumedBy: new aws_iam.FederatedPrincipal('cognito-identity.amazonaws.com',
      {
        StringEquals: {
          'cognito-identity.amazonaws.com:aud': ToDoListIdentityPool.ref,
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'unauthenticated',
        },
      },
      'sts:AssumeRoleWithWebIdentity',),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    })

    new aws_cognito.CfnIdentityPoolRoleAttachment(
      this,
      'identity-pool-role-attachment',
      {
        identityPoolId: ToDoListIdentityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
          unauthenticated:unauthenticatedRole.roleArn
        },
        roleMappings: {
          mapping: {
            type: 'Token',
            ambiguousRoleResolution: 'AuthenticatedRole',
            identityProvider: `cognito-idp.${
              Stack.of(this).region
            }.amazonaws.com/${ToDoListUserPool.userPoolId}:${
              client.userPoolClientId
            }`,
          },
        },
      },
    );

    const ToDoListTable = new aws_dynamodb.Table(this, 'ToDoListTable', {
      partitionKey: { name: 'pk', type: aws_dynamodb.AttributeType.STRING },
      sortKey:{name:'sk', type: aws_dynamodb.AttributeType.STRING},
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const api=new appsync.GraphqlApi(this,'Api',{
      name:'todolist-appsync-api',
      schema:appsync.Schema.fromAsset('schema.graphql'),
      authorizationConfig:{
        defaultAuthorization:{
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: ToDoListUserPool,
            defaultAction: appsync.UserPoolDefaultAction.ALLOW,
        }
      }
    }})

    authenticatedRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect:aws_iam.Effect.ALLOW,
        actions:['appsync:GraphQL'],
        resources:['*']
      })
    )

    const listTodosHandler = new aws_lambda_nodejs.NodejsFunction(this,'listTodosHandler', {
      environment: {
        TABLE_NAME: ToDoListTable.tableName
      },
      entry:'./lib/appsyncResolvers.ts',
      handler: 'listTodosHandler',
    })

    const getTodoHandler = new aws_lambda_nodejs.NodejsFunction(this,'getTodoHandler', {
      environment: {
        TABLE_NAME: ToDoListTable.tableName
      },
      entry:'./lib/appsyncResolvers.ts',
      handler: 'getTodoHandler',
    })

    const createTodoHandler = new aws_lambda_nodejs.NodejsFunction(this,'createTodoHandler', {
      environment: {
        TABLE_NAME: ToDoListTable.tableName
      },
      entry:'./lib/appsyncResolvers.ts',
      handler: 'createTodoHandler',
    })

    const updateTodoDescriptionHandler = new aws_lambda_nodejs.NodejsFunction(this,'updateTodoDescriptionHandler', {
      environment: {
        TABLE_NAME: ToDoListTable.tableName
      },
      entry:'./lib/appsyncResolvers.ts',
      handler: 'updateTodoDescriptionHandler',
    })

    const updateTodoCompletedHandler = new aws_lambda_nodejs.NodejsFunction(this, 'updateTodoCompletedHandler',{
      environment:{
        TABLE_NAME:ToDoListTable.tableName
      },
      entry:'./lib/appsyncResolvers.ts',
      handler: 'updateTodoCompletedHandler',
    })

    const deleteTodoHandler = new aws_lambda_nodejs.NodejsFunction(this,'deleteTodoHandler', {
      environment: {
        TABLE_NAME: ToDoListTable.tableName
      },
      entry:'./lib/appsyncResolvers.ts',
      handler: 'deleteTodoHandler',
    })

    const getSignedURLHandler = new aws_lambda_nodejs.NodejsFunction(this, 'getSignedURLHandler', {entry:'./lib/appsyncResolvers.ts', handler:'getSignedURLHandler'})

    const getSignedGetURLHandler = new aws_lambda_nodejs.NodejsFunction(this, 'getSignedGetURLHandler', {entry:'./lib/appsyncResolvers.ts', handler:'getSignedGetURLHandler'})

    const userUploadsPolicy = new aws_iam.PolicyStatement({
      actions:['s3:GetObject','s3:PutObject','s3:GetObject', 's3:DeleteObject','s3:PostObject'],
      resources:['arn:aws:s3:::cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5/*']
    })

    const secondUserUploadsPolicy = new aws_iam.PolicyStatement({
      actions:['s3:GetObject','s3:PutObject','s3:GetObject', 's3:DeleteObject','s3:PostObject'],
      resources:['arn:aws:s3:::cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5']
    })

    getSignedURLHandler.role?.attachInlinePolicy(
      new aws_iam.Policy(this, 'uploadFilesPolicy',{
        statements:[userUploadsPolicy, secondUserUploadsPolicy]
      })
    )

    getSignedGetURLHandler.role?.attachInlinePolicy(
      new aws_iam.Policy(this, 'getFilesPolicy',{
        statements:[userUploadsPolicy, secondUserUploadsPolicy]
      })
    )

    ToDoListTable.grantReadWriteData(listTodosHandler);
    ToDoListTable.grantReadWriteData(getTodoHandler);
    ToDoListTable.grantReadWriteData(createTodoHandler);
    ToDoListTable.grantReadWriteData(updateTodoDescriptionHandler);
    ToDoListTable.grantReadWriteData(deleteTodoHandler);
    ToDoListTable.grantReadWriteData(updateTodoCompletedHandler)

    const listTodosDataSource = api.addLambdaDataSource('listTodosDataResolver', listTodosHandler);
    const getTodoDataSource = api.addLambdaDataSource('getTodoDataResolver', getTodoHandler);
    const createTodoDataSource = api.addLambdaDataSource('createTodoDataResolver', createTodoHandler);
    const updateTodoDescriptionDataSource = api.addLambdaDataSource('updateTodoDescriptionDataResolver', updateTodoDescriptionHandler);
    const deleteTodoDataSource = api.addLambdaDataSource('deleteTodoDataResolver', deleteTodoHandler);
    const userUploadsS3DataSource = api.addLambdaDataSource('getSignedURLResolver', getSignedURLHandler);
    const userGetFilesS3DataSource = api.addLambdaDataSource('getSignedGetURLResolver', getSignedGetURLHandler);
    const updateTodoCompletedDataSource = api.addLambdaDataSource('updateTodoCompletedResolver', updateTodoCompletedHandler);

    userUploadsS3DataSource.createResolver({
      fieldName:'getSignedURL',
      typeName:'Mutation'
    })

    userGetFilesS3DataSource.createResolver({
      fieldName:'getSignedGetURL',
      typeName:'Mutation'
    })
    
    listTodosDataSource.createResolver({
      fieldName:'listTodos',
      typeName:'Query'
    })

    getTodoDataSource.createResolver({
      fieldName:'getTodo',
      typeName:'Query'
    })

    createTodoDataSource.createResolver({
      fieldName:'createTodo',
      typeName:'Mutation'
    })

    updateTodoDescriptionDataSource.createResolver({
      fieldName:'updateTodoDescription',
      typeName:'Mutation'
    })

    updateTodoCompletedDataSource.createResolver({
      fieldName:'updateTodoCompleted',
      typeName:'Mutation'
    })

    deleteTodoDataSource.createResolver({
      fieldName:'deleteTodo',
      typeName:'Mutation'
    })
  }
}




