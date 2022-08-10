from django.shortcuts import render, redirect
from django.http import HttpResponse, HttpRequest, Http404, HttpResponseRedirect
from .models import Recipes
from django.views import generic
from django.urls import reverse
from recipes import views


def index(request):
    recipes_list = Recipes.objects.all()
    context = {
        'recipes_list': recipes_list
    }
    return render(request, 'recipes/index.html', context)

def create_recipe(request):
    if request.method == 'POST':
        name = request.POST['name']
        description = request.POST['description']

        # format ingredients input into a list before posting
        ingredients = request.POST['ingredients']
        formattedIngredients = ingredients.split(',')

        data = Recipes(name=name, description=description, ingredients=formattedIngredients)
        data.save()
        return redirect('recipes:index')
    else:
        return render(request, 'recipes/create_recipe.html')

def detail(request, id):
    try:
        recipe = Recipes.objects.get(pk=id)
    except Recipes.DoesNotExist:
        raise Http404("Recipe does not exist")

    return render(request,'recipes/detail.html', {'recipe': recipe})

def delete(request, id):
    recipe = Recipes.objects.get(pk=id)
    recipe.delete() 
    return redirect('recipes:index')

def update(request, id):
    recipe = Recipes.objects.get(pk=id)

    # convert list into string before presenting to user
    formattedIngredients = ' '.join(recipe.ingredients)
    formattedRecipe = Recipes(name=recipe.name, description=recipe.description, ingredients=formattedIngredients)

    return render(request, 'recipes/update.html', {'recipe': formattedRecipe})

def updaterecord(request, id):
    recipe = Recipes.objects.get(pk=id)

    # format ingredients before posting to db
    ingredients = request.POST['ingredients']
    splitIngredients = ingredients.split(',')
    recipe.ingredients = splitIngredients

    # set other variables
    recipe.name = request.POST['name']
    recipe.description = request.POST['description']
    
    # save updates
    recipe.save()
    return redirect('recipes:index')






