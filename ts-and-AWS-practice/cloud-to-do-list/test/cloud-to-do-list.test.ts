import {createTodoHandler, getTodoHandler, listTodosHandler} from '../lib/appsyncResolvers'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand} from '@aws-sdk/lib-dynamodb'
import {mockClient} from 'aws-sdk-client-mock'

const ddbMock = mockClient(DynamoDBDocumentClient)

describe('getTodo handler',() => {

    const expectedTodo = {
        pk: 'todo',
        sk: 'sortkey'        
    }

    let fetchedTodo: any;

    beforeEach( async () => {
        ddbMock.reset();
        ddbMock.on(GetCommand, {TableName: process.env.TABLE_NAME, Key: {pk: 'todo', sk: 'sortkey'} }).resolves({Item: {pk:'todo', sk:'sortkey'}})

        fetchedTodo = await getTodoHandler({arguments:{sk:'sortkey'}});

        process.env.TABLE_NAME = 'CloudToDoListStack-ToDoListTable372509CF-WBFDGK6FFD6I'
    })

    test('handler returns the expected todo item when given valid args', async ()=>{
        expect(fetchedTodo).toMatchObject(expectedTodo)
    })

    test('GetCommand called by DocumentClient within the handler as expected', async ()=>{
        expect(ddbMock).toHaveReceivedCommand(GetCommand)
    }) 

    test('handler throws an error if client request to db fails', async ()=>{
        ddbMock.reset();

        ddbMock.on(GetCommand, {TableName: process.env.TABLE_NAME, Key:{pk: 'todo', sk: 'invalidPk'}}).rejects('mocked rejection')

        const response = await getTodoHandler({arguments:{ sk: 'invalidPk'}})

        expect(response).toBeInstanceOf(Error)
    })
})

describe('listTodos handler', ()=>{
    test('handler returns a list of todos when valid args given', async ()=>{
        ddbMock.reset();

        ddbMock.on(QueryCommand).resolves({Items:[{pk:'pk',sk:'001/etc',attachmentName:'attachmentName', completed: false, description: 'description'}, {pk:'pk',sk:'001/diffetc',attachmentName:'attachmentName', completed: false, description: 'description'}]})

        const fetchedTodos = await listTodosHandler({arguments:{usersub:'001'}});

        expect(fetchedTodos).toHaveLength(2);
    })

    test('returns all the todos belonging to a user (start of sk string is equal to user sub)', async ()=>{
        ddbMock.reset();

        ddbMock.on(QueryCommand).resolves({Items:[{pk:'pk',sk:'001/etc',attachmentName:'attachmentName', completed: false, description: 'description'}, {pk:'pk',sk:'001/diffetc',attachmentName:'attachmentName', completed: false, description: 'description'}, {pk:'pk',sk:'002/etc',attachmentName:'attachmentName', completed: false, description: 'description'}]})

        const fetchedTodos: any = await listTodosHandler({arguments:{usersub:'001'}})

        expect(fetchedTodos).toHaveLength(2)
        expect(fetchedTodos[0].sk).toBe('001/etc')
    })

    test('returns an empty array if there are no todos with a sk belonging to the user', async ()=>{
        ddbMock.reset();

        ddbMock.on(QueryCommand).resolves({Items:[{pk:'pk',sk:'001/etc',attachmentName:'attachmentName', completed: false, description: 'description'}, {pk:'pk',sk:'001/diffetc',attachmentName:'attachmentName', completed: false, description: 'description'}]})

        const fetchedTodos: any = await listTodosHandler({arguments:{usersub:'003'}})

        expect(fetchedTodos).toEqual([])
    })

    test('handler throws an error if client request to db fails', async ()=>{
        ddbMock.reset();

        ddbMock.on(QueryCommand).rejects('mocked rejection');

        const response = await listTodosHandler({arguments:{usersub:'001'}});

        expect(response).toBeInstanceOf(Error);
    })
})

describe('createTodo handler', () => {
    test('handler invokes client with get request if put request is successful', async () => {
        ddbMock.reset();

        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(GetCommand).resolves({});

        await createTodoHandler({arguments:{name: 'name', description: 'description', attachmentName: 'attachmentName', s3Reference: 's3Reference'}, identity:{claims:{sub:'sub'}}});

        expect(ddbMock).toHaveReceivedCommand(PutCommand)
        expect(ddbMock).toHaveReceivedCommand(GetCommand)
    })

    test('handler returns error if put request is unsuccessful and does not call get request', async ()=>{
        ddbMock.reset();

        ddbMock.on(PutCommand).rejects('mock rejection');
        ddbMock.on(GetCommand).resolves({});

        const response = await createTodoHandler({arguments:{name: 'name', description: 'description', attachmentName: 'attachmentName', s3Reference: 's3Reference'}, identity:{claims:{sub:'sub'}}});

        expect(ddbMock).toHaveReceivedCommand(PutCommand)
        expect(ddbMock).not.toHaveReceivedCommand(GetCommand)
        expect(response).toBeInstanceOf(Error);
    })
})

