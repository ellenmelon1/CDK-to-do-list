import { Stack, StackProps, aws_s3, aws_s3_deployment, aws_cognito, aws_dynamodb, aws_iam} from 'aws-cdk-lib';
import * as appsync from '@aws-cdk/aws-appsync-alpha'
import { Construct } from 'constructs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

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

    const corsRule:aws_s3.CorsRule={
      allowedHeaders:['*'],
      allowedMethods:[aws_s3.HttpMethods.GET, aws_s3.HttpMethods.HEAD, aws_s3.HttpMethods.PUT, aws_s3.HttpMethods.POST, aws_s3.HttpMethods.DELETE],
      allowedOrigins:['*'],
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

    authenticatedRole.addToPolicy(new PolicyStatement({
      resources:['arn:aws:s3:::cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5/public/*'],
      actions:['s3:PutObject','s3:GetObject', 's3:DeleteObject']
    }))

    authenticatedRole.addToPolicy(new PolicyStatement({
      resources:['arn:aws:s3:::cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5/private/${cognito-identity.amazonaws.com:sub}/*'],
      actions:['s3:PutObject','s3:GetObject', 's3:DeleteObject']
    }))

    authenticatedRole.addToPolicy(new PolicyStatement({
      resources:['arn:aws:s3:::cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5/protected/${cognito-identity.amazonaws.com:sub}/*'],
      actions:['s3:PutObject','s3:GetObject', 's3:DeleteObject']
    }))

    authenticatedRole.addToPolicy(new PolicyStatement({
      resources:['arn:aws:s3:::cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5/protected/*'],
      actions:['s3:GetObject']
    }))

    authenticatedRole.addToPolicy(new PolicyStatement({
      resources:['arn:aws:s3:::cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5'],
      actions:['s3:ListBucket'],
      conditions:{
        StringLike:{
          's3:prefix':['public','public/*','protected','protected/*','private/${cognito-identity.amazonaws.com:sub}/','private/${cognito-identity.amazonaws.com:sub}/*']
        }
      }
    }))

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
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
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
    const NoneDataSource=api.addNoneDataSource('none');

    // const apiHandler = new aws_lambda_nodejs.NodejsFunction(this,'api', {
    //   entry:'./lib/my-construct.api.ts',
    //   handler: 'handler',
    // })

    // const ToDoListDataSource = api.addLambdaDataSource('ToDoListDataSource', apiHandler)
    
    // ToDoListDataSource.createResolver({
    //   fieldName:'listTodos',
    //   typeName:'Query'
    // })

    const MutationCreateTodoDataResolverFn = new appsync.AppsyncFunction(this,'MutationCreateTodoDataResolverFn',{
      api,
      dataSource:ToDoListDataSource,
      name:'MutationCreateTodoDataResolverFn',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/createTodoDataResolverFn.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/createTodoDataResolverFn.vtl')
    })

    const MutationDeleteTodoDataResolverFn = new appsync.AppsyncFunction(this,'MutationDeleteTodoDataResolverFn',{
      api,
      dataSource:ToDoListDataSource,
      name:'MutationDeleteTodoDataResolverFn',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/MutationDeleteTodoDataResolverFn.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/MutationDeleteTodoDataResolverFn.vtl')
    })

    const MutationUpdateTodoDataResolverFn = new appsync.AppsyncFunction(this,'MutationUpdateTodoDataResolverFn',{
      api,
      dataSource:ToDoListDataSource,
      name:'MutationUpdateTodoDataResolverFn',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/MutationUpdateTodoDataResolverFn.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/MutationUpdateTodoDataResolverFn.vtl')
    })

    const MutationcreateTodoinit0Function = new appsync.AppsyncFunction(this,'MutationcreateTodoinit0Function',{
      api,
      dataSource:NoneDataSource,
      name:'MutationcreateTodoinit0Function',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/MutationcreateTodoinit0Function.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/MutationcreateTodoinit0Function.vtl')
    })

    const MutationupdateTodoinit0Function = new appsync.AppsyncFunction(this,'MutationupdateTodoinit0Function',{
      name:'MutationupdateTodoinit0Function',
      api,
      dataSource:NoneDataSource,
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/MutationupdateTodoinit0Function.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/MutationupdateTodoinit0Function.vtl')
    })

    const QueryGetTodoDataResolverFn = new appsync.AppsyncFunction(this,'QueryGetTodoDataResolverFn',{
      api,
      dataSource:ToDoListDataSource,
      name:'QueryGetTodoDataResolverFn',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/QueryGetTodoDataResolverFn.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/QueryGetTodoDataResolverFn.vtl')
    })

    const QueryListTodosDataResolverFn = new appsync.AppsyncFunction(this,'QueryListTodosDataResolverFn',{
      api,
      dataSource:ToDoListDataSource,
      name:'QueryListTodosDataResolverFn',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/QueryListTodosDataResolverFn.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/QueryListTodosDataResolverFn.vtl')
    })

    const QuerygetTodopostAuth0Function = new appsync.AppsyncFunction(this,'QuerygetTodopostAuth0Function',{
      api,
      dataSource:NoneDataSource,
      name:'QuerygetTodopostAuth0Function',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/QuerygetTodopostAuth0Function.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/QuerygetTodopostAuth0Function.vtl'),
    })

    const SubscriptionOnCreateTodoDataResolverFn = new appsync.AppsyncFunction(this,'SubscriptionOnCreateTodoDataResolverFn',{
      api,
      dataSource:NoneDataSource,
      name:'SubscriptionOnCreateTodoDataResolverFn',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/request-templates/SubscriptionOnCreateTodoDataResolverFn.vtl'),
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/response-templates/SubscriptionOnCreateTodoDataResolverFn.vtl')
    })

    new appsync.Resolver(this, 'updateTodo',{
      api,
      typeName:'Mutation',
      fieldName:'updateTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/UpdateTodoBefore.vtl'),
      pipelineConfig: [MutationupdateTodoinit0Function,QuerygetTodopostAuth0Function,MutationUpdateTodoDataResolverFn],
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/UpdateTodoAfter.vtl')
    })

    new appsync.Resolver(this, 'getTodo',{
      api,
      typeName:'Query',
      fieldName:'getTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/GetTodoBefore.vtl'),
      pipelineConfig:[QuerygetTodopostAuth0Function,QueryGetTodoDataResolverFn],
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/GetTodoAfter.vtl')
    })

    new appsync.Resolver(this, 'createTodo',{
      api,
      typeName:'Mutation',
      fieldName:'createTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/CreateTodoBefore.vtl'),
      pipelineConfig:[MutationcreateTodoinit0Function,QuerygetTodopostAuth0Function,MutationCreateTodoDataResolverFn],
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/CreateTodoAfter.vtl')
    })

    new appsync.Resolver(this, 'deleteTodo',{
      api,
      typeName:'Mutation',
      fieldName:'deleteTodo',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/DeleteTodoBefore.vtl'),
      pipelineConfig:[QuerygetTodopostAuth0Function,MutationDeleteTodoDataResolverFn],
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/DeleteTodoAfter.vtl')
    })

    new appsync.Resolver(this, 'listTodos',{
      api,
      typeName:'Query',
      fieldName:'listTodos',
      requestMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/ListTodosBefore.vtl'),
      pipelineConfig:[QuerygetTodopostAuth0Function,QueryListTodosDataResolverFn],
      responseMappingTemplate:appsync.MappingTemplate.fromFile('./mapping-templates/resolver-templates/ListTodosAfter.vtl')
    })
  }
}


