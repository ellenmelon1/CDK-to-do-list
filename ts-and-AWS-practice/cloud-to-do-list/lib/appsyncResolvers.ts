
import {S3} from 'aws-sdk'
import {documentClient} from './dynamodbclient'
import { DynamoDBClient} from "@aws-sdk/client-dynamodb";

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand} from '@aws-sdk/lib-dynamodb'
import { v4 } from 'uuid'

const config = { 
    region: 'eu-west-2',
 };

interface getTodoEvent {
    arguments:{
        sk: string
    }
}

interface listTodosEvent {
    arguments:{
        usersub:string
    }
}

export const listTodosHandler = async (event:listTodosEvent) => {

    const command = new QueryCommand({
        TableName:process.env.TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues:{
            ':pk':'todo'
        }
    })
    
    try {
        const response = await documentClient.send(command)
        const allTodos = response.Items;
        const filteredTodos = []
        for (let todo of allTodos){
            const owner = todo.sk.split("/")[0]
            if (owner === event.arguments.usersub)
            filteredTodos.push(todo)
        }
        return filteredTodos;
    } catch (error){
        console.log(error)
        return error;
    }
}  

export const getTodoHandler = async (event:getTodoEvent)=>{
    const sk = event.arguments.sk;
        const command = new GetCommand({
            TableName:process.env.TABLE_NAME,
            Key:{
                pk:'todo',
                sk:sk
            }
        })
        try {
            const response = await documentClient.send(command);
            return response.Item;
        } catch (error){
            return error
        }
}

interface createTodoEvent {
    arguments:{
            name: string
            description?: string
            attachmentName?: string
            s3Reference?: string
    },
    identity:{
        claims: {
            sub: string
        }   
    }
}

export const createTodoHandler = async (event: createTodoEvent) =>{
    const sub = event.identity.claims.sub;
    const id = v4();

    const marshallOptions = {
        removeUndefinedValues: true
    }

    const translateConfig = {marshallOptions}

    const dynamodbClient = new DynamoDBClient(config);
    const documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);

    const command = new PutCommand({
        TableName:process.env.TABLE_NAME,
        Item:{
            'pk': 'todo',
            'sk': sub +'/' + id,
            'completed': false,
            'name': event.arguments.name,
            'description': event.arguments.description,
            'attachmentName':event.arguments.attachmentName,
            's3Reference':event.arguments.s3Reference
        },
    })

    const getCommand = new GetCommand({
        TableName:process.env.TABLE_NAME,
        Key:{
            pk:'todo',
            sk:sub +'/' + id
        }
    })

    try {
        const putRequest = await documentClient.send(command);
        const getRequest = await documentClient.send(getCommand);

        console.log('returned from put request: ', putRequest)
        console.log("returned from function: ", getRequest)
        return getRequest.Item;
        
    } catch(error){
        console.log(error);
        return error;
    }
}

interface updateTodoDescriptionEvent {
    arguments:{
            sk:string,
            description: string
    }  
}

export const updateTodoDescriptionHandler = async (event: updateTodoDescriptionEvent) =>{

    const updateCommand = new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key:{
            pk:'todo',
            sk:event.arguments.sk
        },
        UpdateExpression:"set description = :d",
        ExpressionAttributeValues:{
            ':d':event.arguments.description
        }
    })

    const getCommand = new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key:{
            pk:'todo',
            sk: event.arguments.sk
        }
    })

    try {
        const updateRequest = await documentClient.send(updateCommand);
        const getRequest = await documentClient.send(getCommand);

        return getRequest.Item;

    }catch(error){
        console.log(error)
        return error;
    }
}

interface updateTodoCompletedEvent {
    arguments:{
            sk:string,
            completed: boolean
    }  
}

export const updateTodoCompletedHandler = async (event: updateTodoCompletedEvent) =>{

    const updateCommand = new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key:{
            pk:'todo',
            sk:event.arguments.sk
        },
        UpdateExpression:"set completed = :c",
        ExpressionAttributeValues:{
            ':c':event.arguments.completed
        }
    })

    const getCommand = new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key:{
            pk:'todo',
            sk: event.arguments.sk
        }
    })

    try {
        const updateRequest = await documentClient.send(updateCommand);
        const getRequest = await documentClient.send(getCommand);

        return getRequest.Item;

    }catch(error){
        console.log(error)
        return error;
    }
}

interface deleteTodoInput {
    arguments: {
        sk: string,
    }  
}

export const deleteTodoHandler = async (event: deleteTodoInput) =>{

    const deleteCommand = new DeleteCommand({
        TableName:process.env.TABLE_NAME,
        Key:{
            pk:'todo',
            sk:event.arguments.sk
        }
    })

    try {
        await documentClient.send(deleteCommand)
        return event.arguments.sk

    } catch (error){
        console.log(error)
        return error;
    } 
}

interface getSignedURLInput {
    arguments: {
        fileType: string,
        key: string
    }
}

export const getSignedURLHandler=async(event: getSignedURLInput)=>{

    const s3 = new S3();
    const params = {
        Bucket: 'cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5',
        Key:event.arguments.key,
        Expires:120,
        ContentType: event.arguments.fileType,
    }

    const signedPutUrl = await s3.getSignedUrlPromise('putObject',{...params})
    return signedPutUrl;
}

interface getSignedGetURLInput {
    arguments: {
        key: string
    }
}

export const getSignedGetURLHandler = async(event:getSignedGetURLInput)=>{
const s3 = new S3();
const params = {
    Bucket: 'cloudtodoliststack-useruploadsbucket84a648c8-6wnm9k0jrtg5',
    Key:event.arguments.key,
    Expires:120
}

const signedGetUrl = await s3.getSignedUrlPromise('getObject', {...params})
return signedGetUrl;
}
