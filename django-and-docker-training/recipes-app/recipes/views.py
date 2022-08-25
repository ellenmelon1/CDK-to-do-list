from django.shortcuts import render, redirect
from django.http import HttpResponse, HttpRequest, Http404, HttpResponseRedirect
from .models import Recipes
from django.views import generic
from django.urls import reverse
from .forms import RecipeForm
from django.contrib.auth.decorators import login_required


@login_required
def index(request):
    recipes_list = Recipes.objects.all()
    context = {
        'recipes_list': recipes_list
    }
    return render(request, 'recipes/index.html', context)

@login_required
def create_recipe(request):
    if request.method == 'POST':
        form = RecipeForm(request.POST, request.FILES)
        if form.is_valid():
            name = form.cleaned_data.get('name')
            description = form.cleaned_data.get('description')
            image = form.cleaned_data.get('image')
            
            # format ingredients input into a list before posting
            ingredients = form.cleaned_data.get('ingredients')
            formattedIngredients = ingredients.split(',')

            data = Recipes(name=name, description=description, ingredients=formattedIngredients, image=image)
            data.save()

            return redirect('recipes:index')
    else:
        form = RecipeForm()
    return render(request, 'recipes/create_recipe.html', {'form': form})

@login_required
def detail(request, id):
    try:
        recipe = Recipes.objects.get(pk=id)
    except Recipes.DoesNotExist:
        raise Http404("Recipe does not exist")

    return render(request,'recipes/detail.html', {'recipe': recipe})

@login_required
def delete(request, id):
    recipe = Recipes.objects.get(pk=id)
    recipe.delete() 
    return redirect('recipes:index')

@login_required
def update(request, id):
    recipe = Recipes.objects.get(pk=id)

    # convert list into string before presenting to user
    formattedIngredients = ' '.join(recipe.ingredients)
    formattedRecipe = Recipes(name=recipe.name, description=recipe.description, ingredients=formattedIngredients)

    return render(request, 'recipes/update.html', {'recipe': formattedRecipe})

@login_required
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






