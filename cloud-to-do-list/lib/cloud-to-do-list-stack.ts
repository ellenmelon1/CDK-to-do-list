import { Stack, StackProps,aws_s3 as s3, aws_s3_deployment, aws_cognito } from 'aws-cdk-lib';
import { Construct } from 'constructs';

// import * as sqs from 'aws-cdk-lib/aws-sqs';


export class CloudToDoListStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ToDoListBucket = new s3.Bucket(this, 'ToDoListBucket', {
      versioned: true,
      blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false, blockPublicAcls:false,ignorePublicAcls:false, restrictPublicBuckets:false }),
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
    ToDoListUserPool.addClient('app-client', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
    });
  }
}


