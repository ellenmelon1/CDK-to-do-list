from django.urls import path
from . import views

app_name = 'recipes'
urlpatterns = [
    path('', views.index, name='index'),
    path('<int:id>/', views.detail, name='detail'),
    path('create_recipe/', views.create_recipe, name='create_recipe'),
    path('<int:id>/delete/', views.delete, name='delete'),
    path('<int:id>/update/', views.update, name='update'),
    path('<int:id>/update/updaterecord/', views.updaterecord, name='updaterecord')
]