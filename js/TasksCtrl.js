app.directive("quickEdit", function() {
    return {
        restrict: 'A',
        require: "?ngModel",
        link: function(scope, element, attrs, ngModel) {
            var internalElement = element.find(".cell-content");
            ngModel.$render = function() {
                internalElement.text(ngModel.$viewValue || '');
            };

            internalElement.dblclick(function() {
                $(this).attr("contentEditable", "true");
                $(this).focus();

            });

            internalElement.bind('keydown', function(event) {
                var keycode = (event.keyCode ? event.keyCode : event.which);
                if (keycode === 13) { // ENTER
                    $(this).attr("contentEditable", "false");
                    $(this).blur();
                    event.preventDefault();
                    scope.$apply(read);
                }
                if (keycode === 27) { // ESCAPE
                    internalElement.text(ngModel.$viewValue);
                    $(this).attr("contentEditable", "false");
                    $(this).blur();
                }
            });

            function read() {
                var text = internalElement.text();
                ngModel.$setViewValue(text);
            }
        }
    };
});

app.directive('focusElement', function ($timeout) {
    return {
        link: function (scope, element) {
            $timeout(function () {
                element[0].focus();
            }, 50);
        }
    };
});

app.directive('draggable', function () {
    return {
        link: function (scope, element, attrs) {
            element.draggable({
                revert: "invalid",
                start: function(event, ui) {
                    scope.setDraggedTask(scope.$eval(attrs.draggable));
                    element.css("z-index", 1000);
                },
                stop: function(event, ui) {
                    element.css("z-index", 0);
                }
            });
        }
    }
});

app.directive('droppable', function ($log) {
    return {
        link: function (scope, element, attrs) {
            var droppableValues = scope.$eval(attrs.droppable);
            element.droppable({
                accept: function(draggable) {
                    return draggable.hasClass("row")
                        &&
                        ((droppableValues.targetCollection == null && draggable.parents('.subtasks').length != 0)
                          ||
                          (droppableValues.targetCollection != null
                          && droppableValues.targetCollection.indexOf(scope.draggedTask) < 0
                          && draggable != element)
                        );
                },
                hoverClass: "drop-hover",
                greedy: true,
                drop: function(event,ui) {
                    droppableValues.onDrop(scope.draggedTask, droppableValues.target);
                }
            });
        }
    }
});

app.directive('dateInput', function (dateFilter) {
    return {
        require: 'ngModel',
        link: function (scope, elm, attrs, ngModelCtrl) {
            ngModelCtrl.$formatters.push(function (modelValue) {
                return dateFilter(modelValue, "yyyy-MM-dd");
            });

            ngModelCtrl.$parsers.push(function (viewValue) {
                if (moment(new Date(viewValue).valueOf()).isValid()) {
                    return new Date(viewValue).valueOf();
                }
                return null;
            });
        }
    };
});

app.directive("whenScrolled", function () {
    return {
        scope: {
            whenScrolled: '&',
            whenScrollDisabled: '='
        },restrict: 'A',
        link: function (scope, elem) {

            raw = elem[0];
            elem.scroll(function () {
                if (scope.whenScrollDisabled == true) {
                    return;
                }
                if (raw.scrollTop + raw.offsetHeight + 5 >= raw.scrollHeight) {
                    scope.whenScrollDisabled = true;
                    scope.whenScrolled()
                        .then(function() { scope.whenScrollDisabled = false });
                }
            });

        }
    }
});

var EditTaskModalCtrl = function($scope, $modalInstance, task) {
    $scope.task = angular.copy(task);

    var tags = "";
    $scope.task.tags.forEach(function(tag) {
        tags += tag.name + " ";
    });
    $scope.task.tags = tags;

    $scope.ok = function(changedTask) {
        updateTaskWithData(task, changedTask);
        $modalInstance.close(task);
    };

    $scope.cancel = function() {
        $modalInstance.dismiss();
    };

    var updateTaskWithData = function(originalTask, changedTask) {
        originalTask.title = changedTask.title;
        originalTask.description = changedTask.description;
        originalTask.startDate = changedTask.startDate;
        originalTask.dueDate = changedTask.dueDate;
        var tagsNames = changedTask.tags.split(" ");
        originalTask.tags = [];

        tagsNames.forEach(function(tagName) {
            if (!isBlank(tagName)) {
                originalTask.tags.push({"name": tagName.replace("/\\s*/g", "")});
            }
        });

        function isBlank(str) {
            return (!str || /^\s*$/.test(str));
        }

    };

};

var CreateSubtaskModalCtrl = function($scope, $modalInstance) {
    $scope.ok = function(newSubtaskContent) {
        $modalInstance.close(newSubtaskContent);
    };

    $scope.cancel = function() {
        $modalInstance.dismiss();
    };
};

function TasksCtrl($scope, TasksService, TagsService, SearchService, TagsFilteringService, HintsService, $modal, $log, growlNotifications, $location, $q) {

    var NUMBER_OF_FINISHED_TASK_TO_LOAD = 30;

    if ($location.path() == '/finishedTasks') {
        $scope.showUnfinished = false;
        TasksService.service.getFinished({limit: NUMBER_OF_FINISHED_TASK_TO_LOAD, offset: 0}, function (result) {
            TasksService.finishedTasks = result;
            $scope.finishedTasks = TasksService.finishedTasks;
            $scope.$broadcast("hideSplash");
        });
    } else {
        $scope.showUnfinished = true;
        TasksService.service.getUnfinished(function (result) {
            TasksService.tasks = result;
            $scope.unfinishedTasks = TasksService.tasks;
            $scope.$broadcast("hideSplash");
        });
    }

    $scope.tagFilter = TagsFilteringService;
    $scope.workview = false;
    $scope.tasksOrderPredicate = "dueDate";
    $scope.magicInputHint = HintsService.getRandom();
    $scope.filterTasksBySearchPhrase = function(task) {return Tasks.doesTaskMatchSearchPhrase(task, SearchService.searchString)};

    var tasksFilter = new TasksMultiFilter();

    $scope.getFilteredTasks = function(tasks) {
        return tasksFilter.filter(tasks);
    };


    var filterTasksByTag = function(tasks, tagToFilter) {
        return tasks.reduce(function(previousValue, currentTask) {
            if (currentTask.tags.some(function(taskTag) {return taskTag.id == tagToFilter.id})) {
                return previousValue.concat(currentTask);
            }
            return previousValue.concat(filterTasksByTag(currentTask.subtasks, tagToFilter));
        }, []);
    };

    var filterTasksWithNoTag = function(tasks) {
        return tasks.reduce(function(previousValue, currentTask) {
            if (currentTask.tags.length == 0) {
                return previousValue.concat(currentTask);
            }
            return previousValue.concat(filterTasksWithNoTag(currentTask.subtasks));
        }, []);
    };

    $scope.$watch('workview', function(workViewValue, oldValue) {
        if (workViewValue == oldValue) return;
        if (workViewValue) {
            tasksFilter.addFilter('workviewFilter', getWorkViewTasks);
        } else {
            tasksFilter.removeFilter('workviewFilter');
        }
        if ($location.path() == '/finishedTasks') {
            $scope.finishedTasks = $scope.getFilteredTasks(TasksService.finishedTasks);
        } else {
            $scope.unfinishedTasks = $scope.getFilteredTasks(TasksService.tasks);
        }
    });

    $scope.$watch('tagFilter.selectedTag', function(newSelectedTag, oldValue) {
        if(newSelectedTag == oldValue) return;
        if (newSelectedTag === "ALL") {
            tasksFilter.removeFilter('tagFilter');
        } else if (newSelectedTag == "NONE") {
            tasksFilter.addFilter('tagFilter', filterTasksWithNoTag);
        } else {
            tasksFilter.addFilter('tagFilter', function(tasks) {return filterTasksByTag(tasks, newSelectedTag)});
        }
        if ($location.path() == '/finishedTasks') {
            $scope.finishedTasks = $scope.getFilteredTasks(TasksService.finishedTasks);
        } else {
            $scope.unfinishedTasks = $scope.getFilteredTasks(TasksService.tasks);
        }
    });

    var getWorkViewTasks = function (tasks) {
        return tasks.reduce(function(previousValue, currentTask) {
            if (currentTask.subtasks.length == 0 && currentTask.tags.some(function(tag) {return tag.visibleInWorkView}) &&
                isTimestampTodayOrBefore(currentTask.dueDate)) {
                return previousValue.concat(currentTask);
            }
            return previousValue.concat(getWorkViewTasks(currentTask.subtasks));
        }, []);
    };

    var isTimestampTodayOrBefore = function(timestamp) {
        return timestamp <= moment().endOf('day')
    };

    $scope.$watch("showUnfinished", function(newShowUnfinished, oldShowUnfinished) {
       if (oldShowUnfinished == newShowUnfinished) return;
       TasksService.hasUnfinishedTasks = newShowUnfinished;
       if (newShowUnfinished) {
           TasksService.service.getUnfinished(function(tasks) {
               $location.path("/");
               TasksService.tasks = tasks;
               $scope.unfinishedTasks = $scope.getFilteredTasks(TasksService.tasks);
           });
       } else {
           TasksService.service.getFinished({limit: NUMBER_OF_FINISHED_TASK_TO_LOAD, offset: 0}, function (tasks) {
               $location.url("/finishedTasks");
               TasksService.finishedTasks = tasks;
               $scope.finishedTasks = $scope.getFilteredTasks(TasksService.finishedTasks);
           });

       }
    });

    $scope.taskFinished = function(task) {
        task.finished = !task.finished;
        var updatedTask = new TasksService.service(task);
        updatedTask.$update({taskId: task.id}, function(taskAfterUpdate) {
            if ($location.path() == '/finishedTasks') {
                findTaskRecursivelyAndRemoveIt(task, TasksService.finishedTasks);
                $scope.finishedTasks = $scope.getFilteredTasks(TasksService.finishedTasks);
            } else {
                findTaskRecursivelyAndRemoveIt(task, TasksService.tasks);
                $scope.unfinishedTasks = $scope.getFilteredTasks(TasksService.tasks);
            }
            var shortedTitle = taskAfterUpdate.title.substr(0, 15) + "...";
            var newStatusMessage = taskAfterUpdate.finished ? 'finished' : 'set as unfinished';
            growlNotifications.add('Task "' + shortedTitle + '" has been ' + newStatusMessage, 'success', 5000);
        });


    };

    $scope.removeTask = function(task) {
        var removeForSure = confirm("Are you sure to remove this task and all it's subtasks? You cannot undo this.\n" + task.title);
        if (removeForSure) {
            $log.info('Task ' + task.id + ' removed: ' + task.title);
            TasksService.service.delete({taskId: task.id}, function() {
                var shortedTitle = task.title.substr(0, 15) + "...";
                growlNotifications.add('Task "' + shortedTitle + '" has been removed.', 'warning', 10000);
            });
            if ($location.path() == '/finishedTasks') {
                findTaskRecursivelyAndRemoveIt(task, TasksService.finishedTasks);
                $scope.finishedTasks = $scope.getFilteredTasks(TasksService.finishedTasks);
            } else {
                findTaskRecursivelyAndRemoveIt(task, TasksService.tasks);
                $scope.unfinishedTasks = $scope.getFilteredTasks(TasksService.tasks);
            }


        }
    };

    $scope.loadMoreTasks = function() {
        if ($scope.showUnfinished) {
            // loading more dynamically - only for unfinished
            return;
        }

        $log.debug("Loading more finished tasks");
        var currentOffset = TasksService.finishedTasks.length;
        var defer = $q.defer();
        TasksService.service.getFinished({limit: NUMBER_OF_FINISHED_TASK_TO_LOAD, offset: currentOffset}, function (tasks) {
            $location.url("/finishedTasks");
            tasks.forEach(function (task) {
                TasksService.finishedTasks.push(task);
            });
            $scope.finishedTasks = $scope.getFilteredTasks(TasksService.finishedTasks);
            defer.resolve();
        });
        return defer.promise;
    };

    $scope.loading = {finishedTasks: false};

    var findTaskRecursivelyAndRemoveIt = function(task, tasksArray) {
        for (var i in tasksArray) {
            if (tasksArray[i] == task) {
                tasksArray.splice(i, 1);
                return;
            }
            findTaskRecursivelyAndRemoveIt(task, tasksArray[i].subtasks);
        }
    };

    $scope.updateTask = function(task) {
        var updatedTask = new TasksService.service(task);
        updatedTask.$update({taskId: task.id}, function(taskAfterUpdate) {
            if (taskAfterUpdate.finished) {
                Tasks.replaceTaskOrSubtask(TasksService.finishedTasks, task, taskAfterUpdate);
                $scope.finishedTasks = $scope.getFilteredTasks(TasksService.finishedTasks);
            } else {
                Tasks.replaceTaskOrSubtask(TasksService.tasks, task, taskAfterUpdate);
                $scope.unfinishedTasks = $scope.getFilteredTasks(TasksService.tasks);
            }
            var shortedTitle = taskAfterUpdate.title.substr(0, 15) + "...";
            growlNotifications.add('Task "' + shortedTitle + '" has been updated.', 'success', 5000);
        });
        $log.info('Task ' + task.id + ' updated: ' + task.title);
    };

    $scope.addNewTask = function (task) {
        $log.debug("Task with title: " + task.title + " added");
        var newTask = new TasksService.service(task);
        newTask.$save(function(addedTask) {
            TasksService.tasks.push(addedTask);
            $scope.unfinishedTasks = $scope.getFilteredTasks(TasksService.tasks);
            $scope.magicInput = "";
            var shortedTitle = addedTask.title.substr(0, 15) + "...";
            growlNotifications.add('Task "' + shortedTitle + '" has been created.', 'success', 3000);
        });
        $scope.magicInputHint = HintsService.getRandom();
    };

    $scope.createSubtask = function(task, subtask) {
        new TasksService.service(subtask).$save(function(subtaskResult) {
            TasksService.subtaskService.add({taskId: task.id, subtaskId: subtaskResult.id}, function() {
                task.subtasks = task.subtasks.concat([subtaskResult]);
                $log.info('Subtask ' + subtaskResult.title + ' id=(' + subtaskResult.id + ') created for task: ' + task.title + " id=(" + task.id + ")");
                var subtaskShortedTitle = subtaskResult.title.substr(0, 15) + "...";
                var parentShortedTitle = task.title.substr(0, 15) + "...";
                growlNotifications.add('Subtask "' + subtaskShortedTitle + '" created for task "' + parentShortedTitle + '".', 'success', 10000);
            });
        });
        $scope.magicInputHint = HintsService.getRandom();
    };

    var findNonExistingTags = function(tags) {
        var existingTagsNames = TagsService.tags.map(function(it) {return it.name});

        var nonExistingTags = [];
        tags.forEach(function(tagFromTask) {
            if (existingTagsNames.indexOf(tagFromTask.name) == -1) {
                var newTag = new TagsService.service(tagFromTask);
                nonExistingTags.push(newTag);
            }
        });
        return nonExistingTags;
    };

    $scope.openEdit = function(task) {
        var editTaskModalInstance = $modal.open({
            templateUrl: 'html/editTaskModalContent.html',
            backdrop: 'static',
            controller: EditTaskModalCtrl,
            resolve: {
                task: function() {
                    return task;
                }
            }
        });
        editTaskModalInstance.result.then(function(originalTask) {
            var tagsToAdd = findNonExistingTags(originalTask.tags);
            addTagsAndDoSomethingElseLater(tagsToAdd, function() {$scope.updateTask(originalTask)});
        });
    };

    $scope.openCreateSubtask = function(task) {
        var createSubtaskModalInstance = $modal.open({
            templateUrl: 'html/createSubtaskModalContent.html',
            backdrop: 'static',
            controller: CreateSubtaskModalCtrl
        });
        createSubtaskModalInstance.result.then(function(newSubtaskContent) {
            var subTask =  new MagicInputParser().parse(newSubtaskContent);

            var tagsToAdd = findNonExistingTags(subTask.tags);
            addTagsAndDoSomethingElseLater(tagsToAdd, function() {$scope.createSubtask(task, subTask)});
        });
    };


    $scope.draggedTask = null;
    $scope.draggedTaskIndex = null;
    $scope.setDraggedTask = function(task) {
        $scope.draggedTask = task;
        $scope.draggedTaskPosition = findTaskPosition(task, $scope.unfinishedTasks);
        if ($scope.draggedTaskPosition == -1) {
            throw "Dragged task's position not found" + task;
        }
    };

    var findTaskPosition = function(task, tasksArray) {
        for (var i in tasksArray) {
            if (tasksArray[i] == task) {
                return [i];
            }
            var inResult = findTaskPosition(task, tasksArray[i].subtasks);
            if (inResult != -1) {
                inResult.push(i);
                return inResult;
            }
        }
        return -1;
    };

    var removeTaskOnPosition = function(draggedTaskPosition, tasksArray) {
        if (draggedTaskPosition.length == 1) {
            tasksArray.splice($scope.draggedTaskPosition.pop(), 1);
            return;
        }
        var positionOnThisLevel = draggedTaskPosition.pop();
        removeTaskOnPosition(draggedTaskPosition, tasksArray[positionOnThisLevel].subtasks);
    };

    $scope.removeDraggedTaskFromPreviousPosition = function() {
        removeTaskOnPosition($scope.draggedTaskPosition, $scope.unfinishedTasks);
    };

    $scope.magicInputSubmit = function() {
        $log.debug('Magic input submitted: ' + $scope.magicInput);
        var task = new MagicInputParser().parse($scope.magicInput);
        if (!task.title) {
            $log.info('Task not added because title is empty');
            return;
        }

        if ($scope.tagFilter.selectedTag != 'ALL' && $scope.tagFilter.selectedTag != 'NONE') {
            task.tags.push($scope.tagFilter.selectedTag);
        }

        var tagsToAdd = findNonExistingTags(task.tags);
        addTagsAndDoSomethingElseLater(tagsToAdd, function() {$scope.addNewTask(task)});
    };

    var addTagsAndDoSomethingElseLater = function(tagsToAdd, somethingElse) {
        var addToTagsCollection = function(createdTag) {
            createdTag.size = 1;
            TagsService.tags.push(createdTag);
        };

        var doSomethingAfterTagsAdded = new MultitaskRunner(
            tagsToAdd.map( function(it) {return function(callbackAfterDone) {return it.$save(function(createdTag) {
                addToTagsCollection(createdTag); callbackAfterDone();
                growlNotifications.add('Tag "' + createdTag.name + '" has been created.', 'success', 3000);
            })}} ),
            somethingElse);

        doSomethingAfterTagsAdded.start();
    };

    var MultitaskRunner = function(tasksToRunWithCallback, onFinishedFunction) {

        var checkIfAllFinished = function() {
            $log.debug("Check if actual counter (" + counter + ") is same as the number of tasks to run (" + tasksToRunWithCallback.length + ")");
            if (counter == tasksToRunWithCallback.length) {
                onFinishedFunction();
            }
        };

        this.start = function() {
            $log.debug("MultitaskRunner started");
            checkIfAllFinished();
            tasksToRunWithCallback.forEach(function(fun) {fun(function() {counter++; checkIfAllFinished()})});
        };

        var counter = 0;

    };

    $scope.moveSubtaskToTask = function(movedTask, newParentTask) {
        $log.debug("Task " + movedTask.id + " moved to new parent task " + newParentTask.id);
        TasksService.subtaskService.add({taskId: newParentTask.id, subtaskId: movedTask.id}, function() {
            newParentTask.subtasks.push($scope.draggedTask);
            $scope.removeDraggedTaskFromPreviousPosition();
            var subtaskShortedTitle = movedTask.title.substr(0, 15) + "...";
            var parentShortedTitle = newParentTask.title.substr(0, 15) + "...";
            growlNotifications.add('Task "' + subtaskShortedTitle + '" has set as subtask of task "' + parentShortedTitle + '".', 'success', 5000);
        });
    };

    $scope.moveSubtaskTopLevel = function(movedTask) {
        $log.debug("Task " + movedTask.id + " moved to top level");
        TasksService.service.moveToTopLevel({taskId: movedTask.id}, function() {
            $scope.unfinishedTasks.push($scope.draggedTask);
            $scope.removeDraggedTaskFromPreviousPosition();
            var taskShortedTitle = movedTask.title.substr(0, 15) + "...";
            growlNotifications.add('Task "' + taskShortedTitle + '" has been moved to top level.', 'success', 5000);
        });
    };
}
