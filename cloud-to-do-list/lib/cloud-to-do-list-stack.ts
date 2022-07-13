import { Stack, StackProps, aws_s3, aws_s3_deployment, aws_cognito, aws_dynamodb, aws_iam, aws_lambda_nodejs } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as appsync from '@aws-cdk/aws-appsync-alpha'
import { Construct } from 'constructs';


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
      sortKey: { name: 'sk', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const api=new appsync.GraphqlApi(this,'Api',{
      name:'todolist-appsync-api',
      schema:appsync.Schema.fromAsset('schema.graphql'),
      authorizationConfig:{
        defaultAuthorization:{
          authorizationType: appsync.AuthorizationType.API_KEY,
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

    // const externalTable = aws_dynamodb.Table.fromTableArn(this,'externalTable','arn:aws:dynamodb:eu-west-2:723455457584:table/Todo-exkw7f5i5reaxo54j2mm5pcu3u-dev')

    const ToDoListDataSource=api.addDynamoDbDataSource('ToDoListDataSource', ToDoListTable);

    // const apiHandler = new aws_lambda_nodejs.NodejsFunction(this,'api', {
    //   entry:'./lib/my-construct.api.ts',
    //   handler: 'handler',
    // })

    // const ToDoListDataSource = api.addLambdaDataSource('ToDoListDataSource', apiHandler)
    
    // ToDoListDataSource.createResolver({
    //   fieldName:'listTodos',
    //   typeName:'Query'
    // })

   new appsync.Resolver(this, 'listTodosResolver',{
      api,
      dataSource:ToDoListDataSource,
      typeName:'Query',
      fieldName:'listTodos',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('graphql/queries.ts'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('graphql/queries.ts')
    })

    new appsync.Resolver(this, 'getTodoResolver',{
      api,
      dataSource:ToDoListDataSource,
      typeName:'Query',
      fieldName:'getTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('graphql/queries.ts'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('graphql/queries.ts')
    })

    new appsync.Resolver(this, 'createTodoResolver',{
      api,
      dataSource:ToDoListDataSource,
      typeName:'Mutation',
      fieldName:'createTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('graphql/mutations.ts'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('graphql/mutations.ts')
    })

    new appsync.Resolver(this, 'updateTodoResolver',{
      api,
      dataSource:ToDoListDataSource,
      typeName:'Mutation',
      fieldName:'updateTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('graphql/mutations.ts'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('graphql/mutations.ts')
    })

    new appsync.Resolver(this, 'deleteTodoResolver',{
      api,
      dataSource:ToDoListDataSource,
      typeName:'Mutation',
      fieldName:'deleteTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('graphql/mutations.ts'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('graphql/mutations.ts')
    })
  }
}


