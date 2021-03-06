"use strict";

var Tasks = {

    findTaskAncestors: function(tasks, taskId) {
        var ancestors = [];
        for(var i in tasks) {
            if (tasks[i].subtasks != undefined && tasks[i].subtasks.some(function(subtask) {return subtask.id == taskId})) {
                ancestors.push(tasks[i]);
                break;
            }
        }

        if (ancestors.length > 0) {
            return ancestors;
        } else {
            tasks.forEach(function(task) {
                ancestors = ancestors.concat(Tasks.findTaskAncestors(task.subtasks, taskId));
                if (ancestors.length > 0) {
                    ancestors.push(task);
                }
            });
        }
        return ancestors;
    },

    replaceTaskOrSubtask: function(tasks, oldTask, newTask) {
        var index = tasks.indexOf(oldTask);
        if (index == -1) {
            tasks.forEach(function(task) {
                Tasks.replaceTaskOrSubtask(task.subtasks, oldTask, newTask);
            });
        } else {
            tasks[index] = newTask;
        }
    },

    doesTaskMatchSearchPhrase: function(task, searchPhrase) {
        if (searchPhrase.length == 0) { return true; }

        var searchPhraseLowercase = searchPhrase.toLowerCase();
        if (task.title.toLowerCase().indexOf(searchPhraseLowercase) != -1 ||
            (task.description != null && task.description.toLowerCase().indexOf(searchPhraseLowercase) != -1)) {
            return true;
        }
        if (task.subtasks == undefined) return false;
        return task.subtasks.some(function(task) {return Tasks.doesTaskMatchSearchPhrase(task, searchPhrase)})
    }
};

function TasksMultiFilter() {
    this.filters = {};
}

TasksMultiFilter.prototype.addFilter = function(filterName, filterCallback) {
    this.filters[filterName] = filterCallback;
};


TasksMultiFilter.prototype.removeFilter = function(filterName) {
    if (this.filters[filterName] == null) {
        throw "Filter with name '"+ filterName + "' does not exist";
    }
    delete this.filters[filterName];
};

TasksMultiFilter.prototype.filter = function(tasks) {
    var filteredTasks = tasks;
    for (var filterName in this.filters) {
        filteredTasks = this.filters[filterName](filteredTasks)
    }
    return filteredTasks;
};
